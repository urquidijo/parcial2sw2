import { Controller, Get } from '@nestjs/common';
import { PropertiesService } from './properties.service';

/**
 * Descripción de la arquitectura interna de este microservicio (la muestra el modo demo del portal).
 * Incluye los últimos eventos de dominio publicados por el agregado Property.
 */
@Controller('api/v1/architecture')
export class ArchitectureController {
  @Get()
  describe() {
    return {
      service: 'ms-properties',
      technology: 'NestJS 10 + MongoDB Atlas',
      architecture: 'DDD (Domain-Driven Design)',
      boundedContext: 'Catálogo de inmuebles',
      layers: [
        { name: 'Dominio', path: 'src/properties/domain/', items: ['Agregado raíz Property (property.aggregate.ts)', 'Value objects Money y GeoLocation', 'Eventos de dominio (PropertyReservationLocked, PropertyReleased, PropertyReserved, PropertyStatusChanged)', 'Interfaz PropertyRepository', 'Errores de dominio (PropertyNotAvailableError)'] },
        { name: 'Aplicación', path: 'src/properties/properties.service.ts', items: ['Carga el agregado, aplica la regla, guarda y publica los eventos', 'Traduce errores de dominio a HTTP (409 / 400 / 404)'] },
        { name: 'Infraestructura', path: 'src/properties/infrastructure/ y schemas/', items: ['MongoPropertyRepository (Mongoose) implementa PropertyRepository', 'Esquemas de MongoDB'] },
        { name: 'Interfaz', path: 'src/properties/*.controller.ts', items: ['Controladores REST (mismas rutas y JSON que antes)'] },
      ],
      invariants: [
        'Solo un inmueble DISPONIBLE puede bloquearse para una reserva (evita la doble reserva en la saga)',
        'Liberar deja el inmueble DISPONIBLE y sin titular ni bloqueo',
        'Precio y arras no pueden ser negativos; las coordenadas deben estar en rango',
      ],
      recentDomainEvents: PropertiesService.recentEvents.slice(0, 10),
    };
  }
}
