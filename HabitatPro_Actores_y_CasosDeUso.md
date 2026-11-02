**Habitat Pro**

Actores y casos de uso — Metodología ICONIX

*Versión 1 — 2do parcial*

# **1\. Alcance**

Habitat Pro es una plataforma inmobiliaria que gestiona operaciones de venta y alquiler de inmuebles: catálogo, consultas, visitas, reservas con arras, contratos, pagos y comisiones.

La inteligencia artificial se usa para generar reportes y análisis para gerencia. El usuario solicita el reporte hablando: su voz se convierte a texto, la consulta se envía al servicio de IA junto con los datos reales del sistema y se devuelve el reporte.

# **2\. Actores**

| Actor | Tipo | Descripción |
| :---- | :---- | :---- |
| Cliente | Principal | Busca inmuebles, envía consultas, agenda visitas, reserva pagando arras y firma contratos. |
| Empleado | Principal (abstracto) | Generaliza a los sectores de la empresa. Los CU comunes a todos los empleados se asocian a este actor. |
|   Agente | Hijo de Empleado | Gestiona inmuebles y la agenda de visitas. |
|   Oficial Legal | Hijo de Empleado | Genera y anula contratos. |
|   Cajero / Finanzas | Hijo de Empleado | Registra pagos, reembolsos y liquida comisiones. |
| Administrador General | Principal | Gestiona empleados, consulta el dashboard y solicita reportes de IA por voz. |
| Servicio de IA (Claude) | Secundario | Genera los reportes y análisis a partir de los datos reales. |
| Servicio de voz a texto | Secundario | Convierte la solicitud hablada en texto. |
| Pasarela de pagos | Secundario | Procesa cobros de arras y reembolsos. |

En el diagrama de casos de uso, Empleado se modela como actor padre y los tres sectores como actores hijos mediante generalización. Así, los casos de uso comunes (por ejemplo, Iniciar sesión) se asocian una sola vez a Empleado y los heredan todos los sectores.

ENFOCAR AL CLIENTE LA APP MOBILE y la noti push para que un cliente mande una reserva , CON IA LOCAL

# **3\. Casos de uso por integrante**

La división sigue los microservicios: cada integrante es responsable del backend, del microfrontend y de la documentación ICONIX completa (descripción, diagrama de robustez y diagrama de secuencia) de sus casos de uso. El modelo de dominio se elabora entre los tres.

## **Integrante 1 — Catálogo y app móvil (ms-properties-nestjs, mfe-properties-react)**

| Código | Caso de uso | Actor | Estado | Móvil |
| :---- | :---- | :---- | :---- | :---- |
| CU01 | Consultar catálogo (buscar inmuebles con filtros y cercanía, ver ficha del inmueble y enviar consultas) | Cliente | Parcial | Sí |
| CU02 | Gestionar inmueble (registrar para venta o alquiler, editar, gestionar fotos y planos en S3 Amazon y cambiar estado) | Agente | Parcial |  |
| CU03 | Predecir precio de inmueble (modelo supervisado random forest) | Agente | Nuevo |  |
| CU04 | Autocompletar ficha del inmueble desde una foto (autocompletado de descripción o datos de propiedades mediante el análisis de una imagen de la propiedad a registrar) | Agente | Nuevo |  |
| CU05 | Guiar por el sistema con agente IA | Cliente / Empleados | Nuevo | Sí |
| CU06 | Recibir notificación push de reservas | Cliente | Nuevo | Sí |

## **Integrante 2 — Usuarios, visitas y contratos (ms-contracts-spring, mfe-contracts-angular)**

| Código | Caso de uso | Actor | Estado | Móvil |
| :---- | :---- | :---- | :---- | :---- |
| CU07 | Autenticarse (registrarse e iniciar sesión) | Cliente / Empleado / Administrador | Ajustar | Sí |
| CU08 | Gestionar empleados (alta, baja, sector) | Administrador General | Ajustar |  |
| CU09 | Agendar visita | Cliente | Implementado | Sí |
| CU10 | Gestionar agenda de visitas | Agente | Implementado |  |
| CU11 | Gestionar contrato (generar contrato de compraventa o alquiler y anularlo) | Oficial Legal | Implementado |  |
| CU12 | Firmar contrato digitalmente | Cliente | Implementado | Sí |
| CU13 | Segmentar clientes según su comportamiento (modelo no supervisado regresión lineal o regresión logística. Observación: la regresión lineal y la logística son modelos supervisados; para un modelo no supervisado corresponde K-means u otro algoritmo de clustering) | Administrador General | Nuevo |  |

## **Integrante 3 — Reservas, finanzas e IA (ms-billing-php, saga-orchestrator, mfe-bi-next)**

| Código | Caso de uso | Actor | Estado | Móvil |
| :---- | :---- | :---- | :---- | :---- |
| CU14 | Reservar inmueble pagando arras (vía n8n: al reservar, la confirmación se envía por Telegram) | Cliente (+ Pasarela de pagos) | Implementado | Sí |
| CU15 | Cancelar reserva con reembolso | Cliente / Cajero | Implementado | Sí |
| CU16 | Registrar pago de operación (saldo de compra o cuota de alquiler) | Cajero | Parcial |  |
| CU17 | Liquidar comisión de agente | Cajero | Implementado |  |
| CU18 | Consultar mis comisiones | Agente | Implementado |  |
| CU19 | Consultar dashboard financiero | Administrador General | Implementado |  |
| CU20 | Solicitar reporte personalizado por voz o texto con IA usando MCP | Administrador General (+ Servicio de voz, Servicio de IA) | Parcial |  |

**Estados:** Implementado \= ya existe en el repositorio; Ajustar \= existe pero debe adaptarse a los nuevos actores; Parcial \= existe una parte; Pendiente \= documentado pero sin implementar; Nuevo \= no existe nada aún. En la columna Móvil, Sí indica que el caso de uso estará disponible en la app móvil del cliente.

# **4\. Cambios respecto a lo implementado**

* **Consultas de clientes (CU01):** funcionalidad nueva.

* **Editar inmueble y multimedia (CU02):** no tienen endpoint en ms-properties.

* **Pagos de alquiler (CU16):** hoy solo existe la confirmación de compra; falta registrar cuotas de alquiler.

* **Reporte por voz (CU20):** el endpoint /api/ai/report arma un texto fijo y no llama a ninguna IA. Falta capturar la voz (Web Speech API o AWS Transcribe), enviar la consulta a Claude con los datos reales y devolver el reporte.

* **Roles (CU07, CU08):** el modelo User debe pasar a CLIENTE, EMPLEADO (con un campo sector: AGENTE, LEGAL, FINANZAS, ATENCION) y ADMIN.

* **ARCHITECTURE.md:** alinear con el repositorio (mfe-bi-next en lugar de mfe-bi-vue, quitar ms-reservations-dynamo, actualizar actores y roles).

# **5\. Decisiones pendientes**

* Asignar los nombres de los integrantes a cada bloque.