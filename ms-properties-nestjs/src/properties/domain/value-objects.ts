import { InvalidValueError } from './domain-errors';

/**
 * DDD — Value objects: se definen por su valor (no tienen identidad), son inmutables y se validan al crearse,
 * así un precio negativo o una coordenada imposible nunca llega a un agregado.
 */

/** Monto con moneda (precio, arras). */
export class Money {
  private constructor(readonly amount: number, readonly currency: string) {}

  static of(amount: number, currency = 'USD'): Money {
    if (!Number.isFinite(amount) || amount < 0) throw new InvalidValueError(`Monto inválido: ${amount}`);
    if (!/^[A-Z]{3}$/.test(currency)) throw new InvalidValueError(`Moneda inválida: ${currency}`);
    return new Money(Math.round(amount * 100) / 100, currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}

/** Punto geográfico. MongoDB lo guarda como GeoJSON [longitud, latitud]. */
export class GeoLocation {
  private constructor(readonly latitude: number, readonly longitude: number) {}

  static of(latitude: number, longitude: number): GeoLocation {
    const ok = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    if (!ok) throw new InvalidValueError(`Coordenadas inválidas: ${latitude}, ${longitude}`);
    return new GeoLocation(latitude, longitude);
  }

  /** Crea la ubicación solo si llegaron ambas coordenadas (en las ediciones son opcionales). */
  static optional(latitude?: number, longitude?: number): GeoLocation | undefined {
    return latitude !== undefined && longitude !== undefined ? GeoLocation.of(latitude, longitude) : undefined;
  }

  toGeoJson(): { type: 'Point'; coordinates: [number, number] } {
    return { type: 'Point', coordinates: [this.longitude, this.latitude] };
  }
}
