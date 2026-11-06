/**
 * DDD — Lenguaje ubicuo del Catálogo de inmuebles. El dominio no depende de NestJS ni de Mongoose:
 * el esquema de MongoDB (infraestructura) importa estos tipos, no al revés.
 */
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
