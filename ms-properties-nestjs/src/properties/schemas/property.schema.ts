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
  RESERVADO = 'RESERVADO',
  RESERVADO_PENDIENTE = 'RESERVADO_PENDIENTE',
  RESERVADO_CONFIRMADO = 'RESERVADO_CONFIRMADO',
  COMPRADO = 'COMPRADO',
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

@Schema({ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })
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

  @Prop({ default: 5000 })
  deposit: number;

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

  @Prop({ default: 'Ubicación central' })
  address: string;

  @Prop({ required: true, index: true })
  city: string;

  @Prop({ required: true })
  zone: string;

  @Prop({ type: LocationPointSchema, required: false })
  location?: LocationPoint;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop()
  image?: string;

  @Prop()
  virtualTour3dUrl?: string;

  @Prop({ default: '' })
  folioReal: string;

  @Prop({ default: 120.00 })
  maintenanceFee: number;

  @Prop({ default: 'ENTREGA_INMEDIATA' })
  deliveryType: string;

  @Prop({ default: 'Carlos Broker' })
  brokerName: string;

  @Prop({ type: Object, default: {} })
  dynamicAttributes: Record<string, any>;

  @Prop()
  reservedBy?: string;

  @Prop()
  reservedByClientId?: string;

  @Prop()
  reservedPhone?: string;

  @Prop()
  reservationLockExpiresAt?: Date;
}

export const PropertySchema = SchemaFactory.createForClass(Property);

PropertySchema.virtual('id').get(function () {
  return this._id ? this._id.toString() : this.code;
});

PropertySchema.index({ price: 1, status: 1 });
PropertySchema.index({ city: 1, zone: 1 });
