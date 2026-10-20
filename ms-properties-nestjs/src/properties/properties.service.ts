import { Injectable, NotFoundException, ConflictException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyDocument, PropertyStatus, PropertyType } from './schemas/property.schema';
import { CreatePropertyDto, ReserveLockDto, GeoSearchDto } from './dto/property.dto';

@Injectable()
export class PropertiesService implements OnModuleInit {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
  ) {}

  async onModuleInit() {
    await this.seedInitialData();
  }

  async create(createPropertyDto: any): Promise<Property> {
    const code = createPropertyDto.code || (createPropertyDto.propertyType?.substring(0, 3) + '-' + Math.random().toString(36).substring(2, 6)).toUpperCase();
    const existing = await this.propertyModel.findOne({ code }).exec();
    if (existing) {
      throw new ConflictException(`Ya existe una propiedad con el código ${code}`);
    }

    const payload = {
      ...createPropertyDto,
      code,
      photos: createPropertyDto.photos || (createPropertyDto.image ? [createPropertyDto.image] : []),
      image: createPropertyDto.image || createPropertyDto.photos?.[0] || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
      folioReal: createPropertyDto.folioReal || `FOLIO-${code}`,
      brokerName: createPropertyDto.brokerName || 'Carlos Broker',
      deliveryType: createPropertyDto.deliveryType || 'ENTREGA_INMEDIATA',
      maintenanceFee: parseFloat(createPropertyDto.maintenanceFee) || 120.00,
      amenities: Array.isArray(createPropertyDto.amenities) ? createPropertyDto.amenities : (createPropertyDto.amenities ? createPropertyDto.amenities.split(',').map((s: string) => s.trim()) : ['Seguridad 24/7', 'Ascensor', 'Áreas Verdes']),
    };

    const createdProperty = new this.propertyModel(payload);
    return createdProperty.save();
  }

  async findAll(status?: string, city?: string, propertyType?: string): Promise<any[]> {
    const filter: any = {};
    if (status) filter.status = status;
    if (city) filter.city = new RegExp(city, 'i');
    if (propertyType) filter.propertyType = propertyType;

    const docs = await this.propertyModel.find(filter).sort({ createdAt: -1 }).limit(100).exec();
    return docs.map(d => this.formatPropertyResponse(d));
  }

  async findOne(id: string): Promise<any> {
    let property: any = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      property = await this.propertyModel.findById(id).exec();
    }
    if (!property) {
      property = await this.propertyModel.findOne({ code: id }).exec();
    }
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no encontrada`);
    }
    return this.formatPropertyResponse(property);
  }

  async findByCode(code: string): Promise<any> {
    const property = await this.propertyModel.findOne({ code }).exec();
    if (!property) {
      throw new NotFoundException(`Propiedad con código ${code} no encontrada`);
    }
    return this.formatPropertyResponse(property);
  }

  // Búsqueda Geoespacial
  async searchGeospatial(geoDto: GeoSearchDto): Promise<any[]> {
    const { longitude, latitude, maxDistanceMeters = 5000 } = geoDto;
    try {
      const docs = await this.propertyModel.find({
        status: PropertyStatus.DISPONIBLE,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
            $maxDistance: maxDistanceMeters,
          },
        },
      }).exec();
      return docs.map(d => this.formatPropertyResponse(d));
    } catch (e) {
      return this.findAll('DISPONIBLE');
    }
  }

  // PASO 1 SAGA: Bloqueo preventivo de la propiedad
  async reserveLock(id: string, lockDto: ReserveLockDto): Promise<{ success: boolean; property: any; message: string }> {
    this.logger.log(`[SAGA STEP 1] Bloqueando preventivamente propiedad #${id} para cliente ${lockDto.clientId}`);

    let property: any = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      property = await this.propertyModel.findById(id).exec();
    }
    if (!property) {
      property = await this.propertyModel.findOne({ code: id }).exec();
    }
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no existe`);
    }

    if (property.status !== PropertyStatus.DISPONIBLE) {
      throw new ConflictException(`La propiedad se encuentra en estado ${property.status} y no puede ser reservada`);
    }

    const expiresAt = new Date(Date.now() + (lockDto.lockDurationMinutes || 60) * 60 * 1000);
    property.status = PropertyStatus.RESERVADO_PENDIENTE;
    property.reservedByClientId = lockDto.clientId;
    property.reservationLockExpiresAt = expiresAt;

    await property.save();
    this.logger.log(`[SAGA STEP 1 ÉXITO] Propiedad #${id} bloqueada como RESERVADO_PENDIENTE`);

    return {
      success: true,
      property: this.formatPropertyResponse(property),
      message: 'Propiedad bloqueada preventivamente con éxito en MongoDB.',
    };
  }

  // COMPENSACIÓN SAGA: Liberación de la propiedad si falla el pago o contrato
  async releaseLock(id: string, reason?: string): Promise<{ success: boolean; property: any; message: string }> {
    this.logger.warn(`[SAGA COMPENSACIÓN STEP 1] Liberando propiedad #${id}. Razón: ${reason || 'Rollback Saga'}`);

    let property: any = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      property = await this.propertyModel.findById(id).exec();
    }
    if (!property) {
      property = await this.propertyModel.findOne({ code: id }).exec();
    }
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no existe`);
    }

    property.status = PropertyStatus.DISPONIBLE;
    property.reservedByClientId = undefined;
    property.reservedBy = undefined;
    property.reservedPhone = undefined;
    property.reservationLockExpiresAt = undefined;

    await property.save();
    this.logger.log(`[SAGA COMPENSACIÓN ÉXITO] Propiedad #${id} liberada a DISPONIBLE`);

    return {
      success: true,
      property: this.formatPropertyResponse(property),
      message: 'Compensación completada: propiedad desbloqueada a DISPONIBLE en MongoDB.',
    };
  }

  // CONFIRMACIÓN SAGA: Éxito total de la reserva
  async confirmReserved(id: string, buyerName?: string, buyerPhone?: string): Promise<{ success: boolean; property: any; message: string }> {
    this.logger.log(`[SAGA CONFIRMACIÓN] Confirmando reserva formal para propiedad #${id}`);

    let property: any = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      property = await this.propertyModel.findById(id).exec();
    }
    if (!property) {
      property = await this.propertyModel.findOne({ code: id }).exec();
    }
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no existe`);
    }

    property.status = PropertyStatus.RESERVADO;
    if (buyerName) property.reservedBy = buyerName;
    if (buyerPhone) property.reservedPhone = buyerPhone;

    await property.save();
    return {
      success: true,
      property: this.formatPropertyResponse(property),
      message: 'Reserva confirmada en MongoDB Atlas.',
    };
  }

  // Actualización de estado general
  async updateStatus(id: string, status: string, buyerName?: string): Promise<any> {
    let property: any = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      property = await this.propertyModel.findById(id).exec();
    }
    if (!property) {
      property = await this.propertyModel.findOne({ code: id }).exec();
    }
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no existe`);
    }

    property.status = status;
    if (buyerName !== undefined) property.reservedBy = buyerName;
    if (status === 'DISPONIBLE') {
      property.reservedBy = undefined;
      property.reservedByClientId = undefined;
      property.reservationLockExpiresAt = undefined;
    }

    await property.save();
    return this.formatPropertyResponse(property);
  }

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
    const img = obj.image || obj.photos?.[0] || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80';

    return {
      id: id,
      code: obj.code || id,
      _id: obj._id ? obj._id.toString() : id,
      title: obj.title,
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
