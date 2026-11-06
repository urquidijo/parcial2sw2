import { Property } from './property.aggregate';

/**
 * DDD — Repositorio del agregado Property (interfaz del dominio).
 * La implementación vive en infraestructura (MongoPropertyRepository); el dominio y la aplicación
 * dependen solo de esta interfaz.
 */
export interface PropertyRepository {
  /** Busca por _id de MongoDB o por código de negocio (DEP-VALLE-101). */
  findByIdOrCode(idOrCode: string): Promise<Property | null>;

  /** Guarda el estado del agregado y devuelve el documento completo actualizado (para la respuesta). */
  save(property: Property): Promise<any>;
}

/** Token de inyección de NestJS para la interfaz. */
export const PROPERTY_REPOSITORY = Symbol('PropertyRepository');
