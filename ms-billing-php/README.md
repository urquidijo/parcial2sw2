# Microservicio de Facturación, Pagos y Comisiones (PHP)

- **Tecnología:** PHP 8.3 + Laravel 11 / Symfony + AWS SDK para PHP
- **Base de Datos:** Amazon DynamoDB (Local: `http://localhost:8000`)
- **Puerto por defecto:** 8002
- **Responsabilidad:**
  - Procesamiento de cobros de señas y depósitos de arras de alta concurrencia.
  - Registro de transacciones con baja latencia y TTL automático de reservas.
  - Reembolsos automáticos (Refunds) en caso de compensación Saga.
  - Cálculo de comisiones escalonadas a corredores inmobiliarios.

## Endpoints Principales:
- `POST /api/v1/billing/charges`: Cobro de depósito de arras (Saga Step 2)
- `POST /api/v1/billing/refunds`: Reembolso de dinero (Saga Compensating Step 2)
- `POST /api/v1/commissions/calculate`: Liquidación de comisiones de agentes
- `GET /api/v1/commissions/agent/:id`: Balance y comisiones por broker
