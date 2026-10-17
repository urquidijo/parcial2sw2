# Microservicio de Catálogo y Multimedia (NestJS)

- **Tecnología:** NestJS 10 + TypeScript + Mongoose
- **Base de Datos:** MongoDB 7.0 (`mongodb://localhost:27017/properties_catalog_db`)
- **Puerto por defecto:** 3001
- **Responsabilidad:**
  - Gestión polimórfica de inmuebles (residencial, comercial, lotes).
  - Búsqueda geoespacial por radio (índices `2dsphere`).
  - Gestión de multimedia (fotos, planos, recorridos virtuales).
  - Bloqueo y desbloqueo de estados de propiedad para el patrón Saga.

## Endpoints Principales:
- `POST /api/v1/properties`: Crear inmueble
- `GET /api/v1/properties/search`: Búsqueda geoespacial
- `POST /api/v1/properties/:id/reserve-lock`: Bloqueo preventivo (Saga Step 1)
- `POST /api/v1/properties/:id/release-lock`: Liberación compensatoria (Saga Rollback)
- `POST /api/v1/properties/:id/confirm-reserved`: Confirmación definitiva de reserva
