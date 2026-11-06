/**
 * DDD — Eventos de dominio: hechos del negocio que ya ocurrieron. El agregado los registra y la capa de
 * aplicación los publica después de guardar (hoy se registran en el log; mañana podrían ir a una cola).
 */
export interface DomainEvent {
  readonly name: string;
  readonly propertyCode: string;
  readonly occurredAt: Date;
  readonly data: Record<string, unknown>;
}

const event = (name: string, propertyCode: string, data: Record<string, unknown> = {}): DomainEvent =>
  ({ name, propertyCode, occurredAt: new Date(), data });

/** Paso 1 de la saga: el inmueble quedó apartado provisionalmente para un cliente. */
export const PropertyReservationLocked = (code: string, clientId: string, expiresAt: Date) =>
  event('PropertyReservationLocked', code, { clientId, expiresAt });

/** Compensación de la saga o cancelación: el inmueble volvió a estar disponible. */
export const PropertyReleased = (code: string, reason: string) => event('PropertyReleased', code, { reason });

/** Fin de la saga: la reserva quedó formalizada. */
export const PropertyReserved = (code: string, buyerName?: string) => event('PropertyReserved', code, { buyerName });

/** Cambio de estado administrativo (venta cerrada, alquiler, reapertura). */
export const PropertyStatusChanged = (code: string, from: string, to: string) => event('PropertyStatusChanged', code, { from, to });
