import { PropertyStatus } from './property-status';
import { PropertyNotAvailableError } from './domain-errors';
import {
  DomainEvent, PropertyReleased, PropertyReservationLocked, PropertyReserved, PropertyStatusChanged,
} from './domain-events';

/** Estado del agregado que protegen sus reglas (el ciclo de reserva). */
export interface PropertyReservationState {
  id: string;            // identidad en el repositorio (_id de MongoDB)
  code: string;          // identidad de negocio (DEP-VALLE-101)
  status: string;
  reservedByClientId?: string;
  reservedBy?: string;
  reservedPhone?: string;
  reservationLockExpiresAt?: Date;
}

/**
 * DDD — Agregado raíz Property (Catálogo de inmuebles).
 *
 * Toda modificación del ciclo de reserva pasa por aquí, y aquí viven las invariantes:
 *  - solo un inmueble DISPONIBLE se puede bloquear para una reserva (evita doble reserva en la saga);
 *  - liberar deja el inmueble DISPONIBLE y sin datos de reserva;
 *  - volver a DISPONIBLE borra al titular y el bloqueo.
 * No conoce MongoDB ni HTTP: el repositorio lo carga y lo guarda.
 */
export class Property {
  private events: DomainEvent[] = [];

  private constructor(private state: PropertyReservationState) {}

  static rehydrate(state: PropertyReservationState): Property {
    return new Property({ ...state });
  }

  get code(): string { return this.state.code; }
  get status(): string { return this.state.status; }

  /** Saga paso 1: bloqueo preventivo mientras se cobran las arras y se genera el pre-contrato. */
  lockForReservation(clientId: string, minutes: number, now = new Date()): void {
    if (this.state.status !== PropertyStatus.DISPONIBLE) {
      throw new PropertyNotAvailableError(this.state.status);
    }
    const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);
    this.state = {
      ...this.state,
      status: PropertyStatus.RESERVADO_PENDIENTE,
      reservedByClientId: clientId,
      reservationLockExpiresAt: expiresAt,
    };
    this.record(PropertyReservationLocked(this.state.code, clientId, expiresAt));
  }

  /** Compensación de la saga o cancelación de la reserva. */
  release(reason: string): void {
    this.state = {
      ...this.state,
      status: PropertyStatus.DISPONIBLE,
      reservedByClientId: undefined,
      reservedBy: undefined,
      reservedPhone: undefined,
      reservationLockExpiresAt: undefined,
    };
    this.record(PropertyReleased(this.state.code, reason));
  }

  /** Saga completada: la reserva queda formal a nombre del comprador. */
  confirmReservation(buyerName?: string, buyerPhone?: string): void {
    this.state = {
      ...this.state,
      status: PropertyStatus.RESERVADO,
      reservedBy: buyerName || this.state.reservedBy,
      reservedPhone: buyerPhone || this.state.reservedPhone,
    };
    this.record(PropertyReserved(this.state.code, buyerName));
  }

  /** Cambio administrativo de estado (cierre de venta o alquiler en caja, reapertura). */
  changeStatus(status: string, buyerName?: string): void {
    const from = this.state.status;
    const next: PropertyReservationState = { ...this.state, status };
    if (buyerName !== undefined) next.reservedBy = buyerName;
    if (status === PropertyStatus.DISPONIBLE) {
      next.reservedBy = undefined;
      next.reservedByClientId = undefined;
      next.reservationLockExpiresAt = undefined;
    }
    this.state = next;
    this.record(PropertyStatusChanged(this.state.code, from, status));
  }

  /** Estado para persistir (lo usa el repositorio). */
  snapshot(): PropertyReservationState {
    return { ...this.state };
  }

  /** Entrega y limpia los eventos registrados (los publica la capa de aplicación tras guardar). */
  pullEvents(): DomainEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private record(e: DomainEvent): void {
    this.events.push(e);
  }
}
