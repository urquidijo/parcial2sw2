import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyDocument, PropertyStatus, PropertyType } from './schemas/property.schema';
import { CreatePropertyDto, UpdatePropertyDto, ReserveLockDto, GeoSearchDto } from './dto/property.dto';
import { AuthUser } from '../auth/auth-user';
import { Property as PropertyAggregate } from './domain/property.aggregate';
import { PROPERTY_REPOSITORY, PropertyRepository } from './domain/property.repository';
import { DomainError, InvalidValueError, PropertyNotAvailableError } from './domain/domain-errors';
import { GeoLocation, Money } from './domain/value-objects';
import { DomainEvent } from './domain/domain-events';

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80';

@Injectable()
export class PropertiesService implements OnModuleInit {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
    // DDD: el ciclo de reserva se maneja con el agregado Property a través de su repositorio.
    @Inject(PROPERTY_REPOSITORY)
    private readonly repository: PropertyRepository,
  ) {}

  async onModuleInit() {
    await this.seedInitialData();
  }

  async create(dto: CreatePropertyDto, user?: AuthUser): Promise<any> {
    const code = (dto.code || `${dto.propertyType.substring(0, 3)}-${Math.random().toString(36).substring(2, 6)}`).toUpperCase();
    if (await this.propertyModel.exists({ code })) {
      throw new ConflictException(`Ya existe una propiedad con el código ${code}`);
    }

    this.validateValues(dto);
    const { latitude, longitude, ...fields } = dto;
    const photos = dto.photos ?? [];
    const created = await new this.propertyModel({
      ...fields,
      code,
      location: this.toLocation(latitude, longitude),
      photos,
      image: photos[0] || DEFAULT_IMAGE,
      amenities: dto.amenities ?? [],
      folioReal: dto.folioReal || `FOLIO-${code}`,
      brokerName: user?.name || 'Carlos Broker',
      brokerEmail: user?.email,
    }).save();
    this.logger.log(`Inmueble ${code} registrado por ${user?.email || 'desconocido'}`);
    return this.formatPropertyResponse(created);
  }

  async update(id: string, dto: UpdatePropertyDto): Promise<any> {
    this.validateValues(dto);
    const property: any = await this.findDocument(id);
    const { latitude, longitude, ...fields } = dto;
    property.set(fields);
    if (latitude !== undefined && longitude !== undefined) {
      property.location = this.toLocation(latitude, longitude);
    }
    if (dto.photos) {
      property.image = dto.photos[0] || DEFAULT_IMAGE;
    }
    await property.save();
    return this.formatPropertyResponse(property);
  }

  async findAll(status?: string, city?: string, propertyType?: string): Promise<any[]> {
    const filter: any = {};
    if (status) filter.status = status;
    if (city) filter.city = new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (propertyType) filter.propertyType = propertyType;

    const docs = await this.propertyModel.find(filter).sort({ createdAt: -1 }).limit(100).exec();
    return docs.map(d => this.formatPropertyResponse(d));
  }

  async findOne(id: string): Promise<any> {
    return this.formatPropertyResponse(await this.findDocument(id));
  }

  private async findDocument(id: string): Promise<PropertyDocument> {
    let property: PropertyDocument | null = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      property = await this.propertyModel.findById(id).exec();
    }
    if (!property) {
      property = await this.propertyModel.findOne({ code: id }).exec();
    }
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no encontrada`);
    }
    return property;
  }

  // DDD: la ubicación es el value object GeoLocation (valida rangos y produce el GeoJSON de MongoDB).
  private toLocation(latitude?: number, longitude?: number) {
    return GeoLocation.optional(latitude, longitude)?.toGeoJson();
  }

  // DDD: precio, arras y coordenadas pasan por sus value objects; un valor imposible es un 400.
  private validateValues(dto: { price?: number; deposit?: number; currency?: string; latitude?: number; longitude?: number }) {
    try {
      if (dto.price !== undefined) Money.of(dto.price, dto.currency || 'USD');
      if (dto.deposit !== undefined) Money.of(dto.deposit, dto.currency || 'USD');
      GeoLocation.optional(dto.latitude, dto.longitude);
    } catch (err) {
      if (err instanceof InvalidValueError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  async findByCode(code: string): Promise<any> {
    const property = await this.propertyModel.findOne({ code }).exec();
    if (!property) {
      throw new NotFoundException(`Propiedad con código ${code} no encontrada`);
    }
    return this.formatPropertyResponse(property);
  }

  // Búsqueda geoespacial (índice 2dsphere): inmuebles dentro del radio, del más cercano al más lejano.
  async searchGeospatial(geoDto: GeoSearchDto): Promise<any[]> {
    const { longitude, latitude, maxDistanceMeters = 5000 } = geoDto;
    const docs = await this.propertyModel.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [longitude, latitude] },
          distanceField: 'distanceMeters',
          maxDistance: maxDistanceMeters,
          spherical: true,
        },
      },
      { $limit: 50 },
    ]);
    return docs.map(d => this.formatPropertyResponse(d));
  }

  // ---------------------------------------------------------------------------
  // Ciclo de reserva (saga): DDD. La aplicación carga el agregado, ejecuta la regla de negocio,
  // lo guarda con el repositorio y publica los eventos de dominio.
  // ---------------------------------------------------------------------------

  // PASO 1 SAGA: Bloqueo preventivo de la propiedad
  async reserveLock(id: string, lockDto: ReserveLockDto): Promise<{ success: boolean; property: any; message: string }> {
    this.logger.log(`[SAGA STEP 1] Bloqueando preventivamente propiedad #${id} para cliente ${lockDto.clientId}`);
    const property = await this.loadAggregate(id, `Propiedad #${id} no existe`);
    this.applyRule(() => property.lockForReservation(lockDto.clientId, lockDto.lockDurationMinutes || 60));
    const saved = await this.persist(property);
    this.logger.log(`[SAGA STEP 1 ÉXITO] Propiedad #${id} bloqueada como RESERVADO_PENDIENTE`);
    return {
      success: true,
      property: this.formatPropertyResponse(saved),
      message: 'Propiedad bloqueada preventivamente con éxito en MongoDB.',
    };
  }

  // COMPENSACIÓN SAGA: Liberación de la propiedad si falla el pago o contrato
  async releaseLock(id: string, reason?: string): Promise<{ success: boolean; property: any; message: string }> {
    this.logger.warn(`[SAGA COMPENSACIÓN STEP 1] Liberando propiedad #${id}. Razón: ${reason || 'Rollback Saga'}`);
    const property = await this.loadAggregate(id, `Propiedad #${id} no existe`);
    property.release(reason || 'Rollback Saga');
    const saved = await this.persist(property);
    this.logger.log(`[SAGA COMPENSACIÓN ÉXITO] Propiedad #${id} liberada a DISPONIBLE`);
    return {
      success: true,
      property: this.formatPropertyResponse(saved),
      message: 'Compensación completada: propiedad desbloqueada a DISPONIBLE en MongoDB.',
    };
  }

  // CONFIRMACIÓN SAGA: Éxito total de la reserva
  async confirmReserved(id: string, buyerName?: string, buyerPhone?: string): Promise<{ success: boolean; property: any; message: string }> {
    this.logger.log(`[SAGA CONFIRMACIÓN] Confirmando reserva formal para propiedad #${id}`);
    const property = await this.loadAggregate(id, `Propiedad #${id} no existe`);
    property.confirmReservation(buyerName, buyerPhone);
    const saved = await this.persist(property);
    return {
      success: true,
      property: this.formatPropertyResponse(saved),
      message: 'Reserva confirmada en MongoDB Atlas.',
    };
  }

  // Actualización de estado general (cierre de venta o alquiler, reapertura)
  async updateStatus(id: string, status: string, buyerName?: string): Promise<any> {
    const property = await this.loadAggregate(id, `Propiedad #${id} no encontrada`);
    property.changeStatus(status, buyerName);
    return this.formatPropertyResponse(await this.persist(property));
  }

  private async loadAggregate(id: string, notFoundMessage: string): Promise<PropertyAggregate> {
    const property = await this.repository.findByIdOrCode(id);
    if (!property) throw new NotFoundException(notFoundMessage);
    return property;
  }

  // Traduce las reglas de negocio violadas (dominio) a respuestas HTTP (aplicación).
  private applyRule(rule: () => void): void {
    try {
      rule();
    } catch (err) {
      if (err instanceof PropertyNotAvailableError) throw new ConflictException(err.message);
      if (err instanceof DomainError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private async persist(property: PropertyAggregate): Promise<any> {
    const saved = await this.repository.save(property);
    this.publish(property.pullEvents());
    return saved;
  }

  // Publicación de eventos de dominio: al log y a un historial en memoria (lo muestra el modo demo).
  private publish(events: DomainEvent[]): void {
    for (const e of events) {
      this.logger.log(`[EVENTO DE DOMINIO] ${e.name} · ${e.propertyCode} ${JSON.stringify(e.data)}`);
      PropertiesService.recentEvents.unshift({ name: e.name, propertyCode: e.propertyCode, occurredAt: e.occurredAt.toISOString(), data: e.data });
    }
    PropertiesService.recentEvents.splice(20);
  }

  static readonly recentEvents: Array<{ name: string; propertyCode: string; occurredAt: string; data: Record<string, unknown> }> = [];

  // Restablecer una propiedad a DISPONIBLE
  async resetProperty(id: string): Promise<any> {
    return this.updateStatus(id, PropertyStatus.DISPONIBLE, undefined);
  }

  // Restablecer TODAS a DISPONIBLE
  async resetAllProperties(): Promise<{ count: number; message: string }> {
    const res = await this.propertyModel.updateMany(
      {},
      {
        $set: {
          status: PropertyStatus.DISPONIBLE,
          reservedBy: null,
          reservedByClientId: null,
          reservedPhone: null,
          reservationLockExpiresAt: null,
        },
      },
    );
    return {
      count: res.modifiedCount,
      message: 'Todas las propiedades se han restablecido a DISPONIBLE en MongoDB Atlas.',
    };
  }

  private formatPropertyResponse(doc: any): any {
    const obj = doc.toObject ? doc.toObject() : doc;
    const id = obj.code || (obj._id ? obj._id.toString() : '');
    const img = obj.image || obj.photos?.[0] || DEFAULT_IMAGE;
    const coordinates = obj.location?.coordinates;

    return {
      id: id,
      code: obj.code || id,
      _id: obj._id ? obj._id.toString() : id,
      title: obj.title,
      description: obj.description || '',
      address: obj.address || '',
      currency: obj.currency || 'USD',
      virtualTour3dUrl: obj.virtualTour3dUrl || null,
      latitude: coordinates ? coordinates[1] : null,
      longitude: coordinates ? coordinates[0] : null,
      distanceMeters: obj.distanceMeters !== undefined ? Math.round(obj.distanceMeters) : undefined,
      amenitiesList: Array.isArray(obj.amenities) ? obj.amenities : [],
      type: obj.propertyType,
      propertyType: obj.propertyType,
      city: obj.city,
      zone: obj.zone,
      price: obj.price,
      deposit: obj.deposit || 5000,
      rooms: obj.rooms || 0,
      baths: obj.bathrooms || 0,
      bathrooms: obj.bathrooms || 0,
      area: obj.areaSquareMeters || 0,
      areaSquareMeters: obj.areaSquareMeters || 0,
      parking: obj.parkingSlots || 0,
      parkingSlots: obj.parkingSlots || 0,
      status: obj.status,
      image: img,
      photos: obj.photos?.length ? obj.photos : [img],
      reservedBy: obj.reservedBy || null,
      reservedPhone: obj.reservedPhone || null,
      folioReal: obj.folioReal || `FOLIO-${id}`,
      maintenanceFee: obj.maintenanceFee || 120.00,
      deliveryType: obj.deliveryType || 'ENTREGA_INMEDIATA',
      brokerName: obj.brokerName || 'Carlos Broker',
      brokerEmail: obj.brokerEmail || null,
      amenities: Array.isArray(obj.amenities) ? obj.amenities.join(', ') : (obj.amenities || 'Seguridad 24/7, Ascensor, Áreas Verdes'),
      location: obj.location,
      dynamicAttributes: obj.dynamicAttributes || {},
      createdAt: obj.createdAt,
    };
  }

  // Sembrado inicial de catálogo en MongoDB Atlas
  async seedInitialData(): Promise<void> {
    try {
      const count = await this.propertyModel.countDocuments().exec();
      if (count > 0) {
        this.logger.log(`MongoDB Atlas ya contiene ${count} propiedades registradas.`);
        return;
      }

      this.logger.log('Inicializando catálogo de propiedades en MongoDB Atlas...');
      const samples = [
        {
          code: 'DEP-VALLE-101',
          title: 'Penthouse de Lujo con Terraza Panorámica',
          description: 'Hermoso departamento con vista a la cordillera, acabados de roble y cocina equipada.',
          propertyType: PropertyType.DEPARTAMENTO,
          status: PropertyStatus.DISPONIBLE,
          price: 245000,
          deposit: 5000,
          currency: 'USD',
          areaSquareMeters: 185.5,
          rooms: 3,
          bathrooms: 3,
          parkingSlots: 2,
          address: 'Av. Las Palmas #450, Edificio Altavista, Piso 14',
          city: 'La Paz',
          zone: 'Zona Sur - Calacoto',
          folioReal: 'FOLIO-DEP-101-LP',
          maintenanceFee: 140.00,
          deliveryType: 'ENTREGA_INMEDIATA',
          brokerName: 'Carlos Broker',
          amenities: ['Piscina Climatizada', 'Sauna', 'Seguridad 24/7', 'Ascensor Directo'],
          photos: ['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'],
          image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
          location: { type: 'Point', coordinates: [-68.0892, -16.5398] },
          dynamicAttributes: { piso: 14, expensasMensualesUSD: 140, depositoBaulera: true },
        },
        {
          code: 'CAS-URB-202',
          title: 'Casa Campestre Estilo Mediterráneo',
          description: 'Residencia unifamiliar con amplio jardín arbolado, churrasquera y sala de cine.',
          propertyType: PropertyType.CASA,
          status: PropertyStatus.DISPONIBLE,
          price: 380000,
          deposit: 10000,
          currency: 'USD',
          areaSquareMeters: 420.0,
          rooms: 4,
          bathrooms: 5,
          parkingSlots: 3,
          address: 'Calle Los Sauces #88, Condominio Privado El Bosque',
          city: 'Santa Cruz',
          zone: 'Equipetrol Norte',
          folioReal: 'FOLIO-CAS-202-SCZ',
          maintenanceFee: 200.00,
          deliveryType: 'ENTREGA_INMEDIATA',
          brokerName: 'Carlos Broker',
          amenities: ['Jardín Privado', 'Parrillero / BBQ', 'Cancha de Pádel', 'Club House'],
          photos: ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'],
          image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
          location: { type: 'Point', coordinates: [-63.1821, -17.7689] },
          dynamicAttributes: { antiguedadAnios: 2, riegoAutomatico: true },
        },
        {
          code: 'TER-IND-303',
          title: 'Terreno Comercial e Industrial Z4',
          description: 'Lote plano apto para almacenes, oficinas corporativas o centro logístico.',
          propertyType: PropertyType.TERRENO,
          status: PropertyStatus.DISPONIBLE,
          price: 520000,
          deposit: 15000,
          currency: 'USD',
          areaSquareMeters: 1250.0,
          rooms: 0,
          bathrooms: 0,
          parkingSlots: 10,
          address: 'Km 9 Carretera al Norte',
          city: 'Cochabamba',
          zone: 'Parque Industrial',
          folioReal: 'FOLIO-TER-303-CBB',
          maintenanceFee: 50.00,
          deliveryType: 'ENTREGA_INMEDIATA',
          brokerName: 'Carlos Broker',
          amenities: ['Acceso Pavimentado', 'Red de Gas Industrial', 'Transformador Trifásico'],
          photos: ['https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80'],
          image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
          location: { type: 'Point', coordinates: [-66.1568, -17.3895] },
          dynamicAttributes: { frenteMetros: 25, fondoMetros: 50, zonificacion: 'Z4' },
        },
      ];

      await this.propertyModel.insertMany(samples);
      this.logger.log('✅ 3 propiedades sembradas exitosamente en MongoDB Atlas.');
    } catch (err: any) {
      this.logger.error('Error al sembrar datos en MongoDB Atlas:', err.message);
    }
  }
}
