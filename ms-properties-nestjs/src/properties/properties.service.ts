import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyDocument, PropertyStatus, PropertyType } from './schemas/property.schema';
import { CreatePropertyDto, ReserveLockDto, GeoSearchDto } from './dto/property.dto';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
  ) {}

  async create(createPropertyDto: CreatePropertyDto): Promise<Property> {
    const existing = await this.propertyModel.findOne({ code: createPropertyDto.code }).exec();
    if (existing) {
      throw new ConflictException(`Ya existe una propiedad con el código ${createPropertyDto.code}`);
    }

    const createdProperty = new this.propertyModel(createPropertyDto);
    return createdProperty.save();
  }

  async findAll(status?: PropertyStatus, city?: string, propertyType?: PropertyType): Promise<Property[]> {
    const filter: any = {};
    if (status) filter.status = status;
    if (city) filter.city = new RegExp(city, 'i');
    if (propertyType) filter.propertyType = propertyType;

    return this.propertyModel.find(filter).sort({ createdAt: -1 }).limit(100).exec();
  }

  async findOne(id: string): Promise<Property> {
    const property = await this.propertyModel.findById(id).exec();
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no encontrada`);
    }
    return property;
  }

  async findByCode(code: string): Promise<Property> {
    const property = await this.propertyModel.findOne({ code }).exec();
    if (!property) {
      throw new NotFoundException(`Propiedad con código ${code} no encontrada`);
    }
    return property;
  }

  // Búsqueda Geoespacial usando $near y coordenadas [lng, lat]
  async searchGeospatial(geoDto: GeoSearchDto): Promise<Property[]> {
    const { longitude, latitude, maxDistanceMeters = 5000 } = geoDto;

    return this.propertyModel.find({
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
  }

  // PASO 1 SAGA: Bloqueo preventivo de la propiedad
  async reserveLock(id: string, lockDto: ReserveLockDto): Promise<{ success: boolean; property: Property; message: string }> {
    this.logger.log(`[SAGA STEP 1] Intentando bloquear preventivamente propiedad #${id} para cliente ${lockDto.clientId}`);
    
    const property = await this.propertyModel.findById(id).exec();
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

    this.logger.log(`[SAGA STEP 1 ÉXITO] Propiedad #${id} bloqueada con estado RESERVADO_PENDIENTE hasta ${expiresAt.toISOString()}`);
    return {
      success: true,
      property,
      message: 'Propiedad bloqueada preventivamente con éxito.',
    };
  }

  // COMPENSACIÓN SAGA: Liberación de la propiedad si falla el pago o el contrato
  async releaseLock(id: string, reason?: string): Promise<{ success: boolean; property: Property; message: string }> {
    this.logger.warn(`[SAGA COMPENSACIÓN STEP 1] Liberando propiedad #${id}. Razón: ${reason || 'Rollback de transacción Saga'}`);

    const property = await this.propertyModel.findById(id).exec();
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no existe`);
    }

    property.status = PropertyStatus.DISPONIBLE;
    property.reservedByClientId = null;
    property.reservationLockExpiresAt = null;

    await property.save();

    this.logger.log(`[SAGA COMPENSACIÓN ÉXITO] Propiedad #${id} revertida a estado DISPONIBLE`);
    return {
      success: true,
      property,
      message: 'Compensación completada: propiedad desbloqueada a DISPONIBLE.',
    };
  }

  // CONFIRMACIÓN SAGA: El precontrato y el cobro fueron exitosos
  async confirmReserved(id: string): Promise<{ success: boolean; property: Property; message: string }> {
    this.logger.log(`[SAGA CONFIRMACIÓN] Confirmando reserva formal para propiedad #${id}`);

    const property = await this.propertyModel.findById(id).exec();
    if (!property) {
      throw new NotFoundException(`Propiedad #${id} no existe`);
    }

    property.status = PropertyStatus.RESERVADO_CONFIRMADO;
    await property.save();

    return {
      success: true,
      property,
      message: 'Reserva confirmada definitivamente.',
    };
  }

  // Cargar datos de prueba iniciales si la base de datos está vacía
  async seedInitialData(): Promise<void> {
    const count = await this.propertyModel.countDocuments().exec();
    if (count > 0) return;

    this.logger.log('Inicializando catálogo de propiedades inmobiliarias de muestra...');
    const samples = [
      {
        code: 'DEP-VALLE-101',
        title: 'Penthouse de Lujo con Terraza Panorámica',
        description: 'Hermoso departamento con vista a la cordillera, acabados de roble y cocina equipada.',
        propertyType: PropertyType.DEPARTAMENTO,
        status: PropertyStatus.DISPONIBLE,
        price: 245000,
        currency: 'USD',
        areaSquareMeters: 185.5,
        rooms: 3,
        bathrooms: 3,
        parkingSlots: 2,
        address: 'Av. Las Palmas #450, Edificio Altavista, Piso 14',
        city: 'La Paz',
        zone: 'Zona Sur - Calacoto',
        location: {
          type: 'Point',
          coordinates: [-68.0892, -16.5398], // [lng, lat]
        },
        amenities: ['Piscina Climatizada', 'Sauna', 'Seguridad 24/7', 'Ascensor Directo'],
        photos: [
          'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
        ],
        dynamicAttributes: {
          piso: 14,
          expensasMensualesUSD: 120,
          depositoBaulera: true,
        },
      },
      {
        code: 'CAS-URB-202',
        title: 'Casa Campestre Estilo Mediterráneo',
        description: 'Residencia unifamiliar con amplio jardín arbolado, churrasquera y sala de cine.',
        propertyType: PropertyType.CASA,
        status: PropertyStatus.DISPONIBLE,
        price: 380000,
        currency: 'USD',
        areaSquareMeters: 420.0,
        rooms: 4,
        bathrooms: 5,
        parkingSlots: 3,
        address: 'Calle Los Sauces #88, Condominio Privado El Bosque',
        city: 'Santa Cruz',
        zone: 'Equipetrol Norte',
        location: {
          type: 'Point',
          coordinates: [-63.1821, -17.7689],
        },
        amenities: ['Jardín Privado', 'Parrillero / BBQ', 'Cancha de Pádel', 'Club House'],
        photos: [
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
        ],
        dynamicAttributes: {
          antiguedadAnios: 2,
          riegoAutomatico: true,
        },
      },
      {
        code: 'TER-IND-303',
        title: 'Terreno Comercial e Industrial de Alta Plusvalía',
        description: 'Lote plano apto para almacenes, oficinas corporativas o centro logístico.',
        propertyType: PropertyType.TERRENO,
        status: PropertyStatus.DISPONIBLE,
        price: 520000,
        currency: 'USD',
        areaSquareMeters: 1250.0,
        rooms: 0,
        bathrooms: 0,
        parkingSlots: 10,
        address: 'Km 9 Carretera al Norte',
        city: 'Cochabamba',
        zone: 'Parque Industrial',
        location: {
          type: 'Point',
          coordinates: [-66.1568, -17.3895],
        },
        amenities: ['Acceso Pavimentado', 'Red de Gas Industrial', 'Transformador Eléctrico Trifásico'],
        photos: [
          'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
        ],
        dynamicAttributes: {
          frenteMetros: 25,
          fondoMetros: 50,
          zonificacionUrbana: 'Z4-Industrial/Comercial',
        },
      },
    ];

    await this.propertyModel.insertMany(samples);
    this.logger.log('3 propiedades de muestra sembradas exitosamente en MongoDB.');
  }
}
