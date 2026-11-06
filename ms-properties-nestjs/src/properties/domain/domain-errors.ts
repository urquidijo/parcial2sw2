/**
 * DDD — Errores de dominio: expresan una regla de negocio violada. La capa de aplicación los traduce a
 * respuestas HTTP (409, 404, 400); el dominio no conoce HTTP.
 */
export abstract class DomainError extends Error {}

/** Invariante del agregado: solo un inmueble DISPONIBLE puede bloquearse para una reserva. */
export class PropertyNotAvailableError extends DomainError {
  constructor(readonly currentStatus: string) {
    super(`La propiedad se encuentra en estado ${currentStatus} y no puede ser reservada`);
  }
}

/** Un value object recibió un valor imposible (precio negativo, coordenadas fuera de rango…). */
export class InvalidValueError extends DomainError {}
