export type ContractType = 'PROMESA_COMPRAVENTA' | 'ARRENDAMIENTO' | 'EXCLUSIVIDAD_VENTA' | 'RESERVA_CON_ARRAS';
export type ContractStatus = 'BORRADOR' | 'PENDIENTE_FIRMA' | 'FIRMADO' | 'CANCELADO' | 'RECHAZADO' | 'CONCLUIDO';
export type Sector = 'AGENTE' | 'LEGAL' | 'FINANZAS' | 'ATENCION';
export type AppointmentStatus = 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA';

export interface PropertySummary {
  code: string;
  title: string;
  city?: string;
  zone?: string;
  price?: number;
  status?: string;
}

export interface Signature {
  signerName: string;
  signerRole: 'CLIENTE' | 'LEGAL';
  documentHash: string;
  signedAt: string;
}

export interface Contract {
  id: string;
  contractNumber: string;
  contractType: ContractType;
  status: ContractStatus;
  propertyId: string;
  propertyTitle?: string;
  property?: PropertySummary | null;
  clientId: string;
  clientName?: string;
  totalAmount: number;
  downPayment: number;
  legalClauses?: string;
  cancellationReason?: string;
  signedBy?: string;
  signatures: Signature[];
  signaturesRequired: number;
  createdAt?: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role?: 'ADMIN' | 'EMPLEADO' | 'CLIENTE' | string;
  sector: Sector | null;
  active: boolean;
  createdAt?: string;
  telegramLinked: boolean;
  telegramAlerts: boolean;
}

export interface Client {
  id: string;
  name: string;
  email: string;
}

export interface Appointment {
  id: string;
  propertyId?: string;
  propertyTitle?: string;
  property?: PropertySummary | null;
  clientName?: string;
  clientPhone?: string;
  visitDate: string;
  visitTime: string;
  visitType?: string;
  notes?: string;
  status: AppointmentStatus;
}

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  PROMESA_COMPRAVENTA: 'Compraventa',
  ARRENDAMIENTO: 'Alquiler',
  EXCLUSIVIDAD_VENTA: 'Exclusividad de venta',
  RESERVA_CON_ARRAS: 'Reserva con arras',
};

export const SECTOR_LABELS: Record<Sector, string> = {
  AGENTE: 'Agente inmobiliario',
  LEGAL: 'Oficial legal',
  FINANZAS: 'Cajero / Finanzas',
  ATENCION: 'Atención al cliente',
};
