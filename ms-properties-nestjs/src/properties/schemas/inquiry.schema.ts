import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InquiryDocument = Inquiry & Document;

export enum InquiryStatus {
  PENDIENTE = 'PENDIENTE',
  RESPONDIDA = 'RESPONDIDA',
}

@Schema({ timestamps: true })
export class Inquiry {
  @Prop({ required: true, index: true })
  propertyId: string;

  @Prop({ required: true })
  propertyTitle: string;

  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true })
  clientName: string;

  @Prop()
  clientEmail?: string;

  @Prop()
  clientPhone?: string;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true, enum: InquiryStatus, default: InquiryStatus.PENDIENTE, index: true })
  status: InquiryStatus;

  @Prop()
  answer?: string;

  @Prop()
  answeredBy?: string;

  @Prop()
  answeredAt?: Date;
}

export const InquirySchema = SchemaFactory.createForClass(Inquiry);
