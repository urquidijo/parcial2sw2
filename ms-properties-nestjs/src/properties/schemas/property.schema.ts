import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PropertyDocument = Property & Document;

export enum PropertyType {
  DEPARTAMENTO = 'DEPARTAMENTO',
  CASA = 'CASA',
  TERRENO = 'TERRENO',
  OFICINA = 'OFICINA',
  LOCAL_COMERCIAL = 'LOCAL_COMERCIAL',
}

export enum PropertyStatus {
  DISPONIBLE = 'DISPONIBLE',
  RESERVADO_PENDIENTE = 'RESERVADO_PENDIENTE',
  RESERVADO_CONFIRMADO = 'RESERVADO_CONFIRMADO',
  VENDIDO = 'VENDIDO',
  ALQUILADO = 'ALQUILADO',
}

@Schema({ _id: false })
export class LocationPoint {
  @Prop({ type: String, enum: ['Point'], default: 'Point' })
  type: string;

  @Prop({ type: [Number], required: true }) // [longitude, latitude]
  coordinates: number[];
}

export const LocationPointSchema = SchemaFactory.createForClass(LocationPoint);

@Schema({ timestamps: true })
export class Property {
  @Prop({ required: true, unique: true, index: true })
  code: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true, enum: PropertyType, default: PropertyType.DEPARTAMENTO })
  propertyType: PropertyType;

  @Prop({ required: true, enum: PropertyStatus, default: PropertyStatus.DISPONIBLE, index: true })
  status: PropertyStatus;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true, default: 'USD' })
  currency: string;

  @Prop({ required: true })
  areaSquareMeters: number;

  @Prop({ default: 0 })
  rooms: number;

  @Prop({ default: 0 })
  bathrooms: number;

  @Prop({ default: 0 })
  parkingSlots: number;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true, index: true })
  city: string;

  @Prop()
  zone: string;

  @Prop({ type: LocationPointSchema, required: true })
  location: LocationPoint;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop()
  virtualTour3dUrl?: string;

  @Prop({ type: Object, default: {} })
  dynamicAttributes: Record<string, any>; // Atributos polimórficos

  @Prop()
  reservedByClientId?: string;

  @Prop()
  reservationLockExpiresAt?: Date;
}

export const PropertySchema = SchemaFactory.createForClass(Property);

// Índice geoespacial para búsquedas por radio y proximidad
PropertySchema.index({ location: '2dsphere' });
PropertySchema.index({ price: 1, status: 1 });
