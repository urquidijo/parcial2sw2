# Microservicio de Contratos y Asuntos Legales (Spring Boot)

- **Tecnología:** Java 21 + Spring Boot 3.3 + Spring Data JPA + Hibernate
- **Base de Datos:** PostgreSQL 16 (`jdbc:postgresql://localhost:5432/contracts_db`)
- **Puerto por defecto:** 8081
- **Responsabilidad:**
  - Gestión del ciclo de vida contractual con soporte ACID estricto.
  - Orquestación de firmas electrónicas de compradores y vendedores.
  - Verificación legal de antecedentes y emisión de contratos formales.
  - Generación de pre-contrato y validación notarial en el flujo Saga.

## Endpoints Principales:
- `POST /api/v1/contracts`: Creación de borrador contractual
- `POST /api/v1/contracts/pre-contract`: Generación de pre-contrato (Saga Step 3)
- `POST /api/v1/contracts/:id/signatures`: Registro de firmas digitales
- `POST /api/v1/contracts/:id/cancel`: Anulación compensatoria
