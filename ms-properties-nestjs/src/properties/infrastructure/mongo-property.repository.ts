import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property as PropertyModel, PropertyDocument } from '../schemas/property.schema';
import { Property } from '../domain/property.aggregate';
import { PropertyRepository } from '../domain/property.repository';

const RESERVATION_FIELDS = ['status', 'reservedByClientId', 'reservedBy', 'reservedPhone', 'reservationLockExpiresAt'] as const;

/**
 * DDD — Infraestructura: implementación del repositorio del agregado sobre MongoDB Atlas (Mongoose).
 * Traduce documento ⇄ agregado y guarda solo el estado que el agregado gobierna (el ciclo de reserva).
 */
@Injectable()
export class MongoPropertyRepository implements PropertyRepository {
  constructor(@InjectModel(PropertyModel.name) private readonly model: Model<PropertyDocument>) {}

  async findByIdOrCode(idOrCode: string): Promise<Property | null> {
    let doc: any = null;
    if (/^[0-9a-fA-F]{24}$/.test(idOrCode)) doc = await this.model.findById(idOrCode).exec();
    if (!doc) doc = await this.model.findOne({ code: idOrCode }).exec();
    if (!doc) return null;
    return Property.rehydrate({
      id: doc._id.toString(),
      code: doc.code,
      status: doc.status,
      reservedByClientId: doc.reservedByClientId ?? undefined,
      reservedBy: doc.reservedBy ?? undefined,
      reservedPhone: doc.reservedPhone ?? undefined,
      reservationLockExpiresAt: doc.reservationLockExpiresAt ?? undefined,
    });
  }

  async save(property: Property): Promise<any> {
    const state = property.snapshot();
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    for (const field of RESERVATION_FIELDS) {
      if (state[field] === undefined || state[field] === null) $unset[field] = 1;
      else $set[field] = state[field];
    }
    const update: Record<string, unknown> = { $set };
    if (Object.keys($unset).length) update.$unset = $unset;
    return this.model.findByIdAndUpdate(state.id, update, { new: true }).exec();
  }
}
