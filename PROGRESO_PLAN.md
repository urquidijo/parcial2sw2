# Progreso del plan — Habitat Pro

Seguimiento de las tareas del plan de trabajo (ver `Plan_Trabajo_HabitatPro.docx`).

**Leyenda:** `[x]` hecho y probado · `[~]` en curso · `[ ]` pendiente · `[!]` bloqueado o necesita una decisión

_Última actualización: 02/11/2026_

---

## Preparación del entorno local
- [x] Arreglar `start-all.ps1`, `stop-all.ps1` y `build-and-push-docker.ps1`: guardados en UTF-8 con BOM para que Windows PowerShell 5.1 lea bien los emojis
- [x] `start-all.ps1` usa `powershell` cuando no está instalado `pwsh` (PowerShell 7)
- [x] Maven 3.9.9 portable en `C:\Users\HP VICTUS\tools` y agregado al PATH
- [x] Compilar `ms-contracts-spring` (`.jar`) y `ms-properties-nestjs` (`dist/`)
- [x] Los 4 servicios corren con `.\start-all.ps1`

**Para recompilar después de cambiar código:**
- Spring: `mvn package -DskipTests` en `ms-contracts-spring`
- NestJS: `npm run build` en `ms-properties-nestjs`

---

## Fase 0 — Base común · 29–31 oct
- [x] **Credenciales fuera del código.**
  - ms-properties: la URI de MongoDB Atlas ya no está en `app.module.ts`; se lee de `ms-properties-nestjs/.env` y, si falta, el servicio avisa con un error claro.
  - ms-contracts: la contraseña de PostgreSQL (Render) ya no está en `application.properties`; Spring la lee de `ms-contracts-spring/.env` (gitignored).
  - Probado: los dos servicios arrancan y responden HTTP 200 leyendo solo el `.env`.
- [x] Borrar `mfe-properties-react/src/PropertyExplorer.jsx`, que nadie usaba (el shell carga `PropertyExplorer.js`, que también es React).
- [x] Corregir `ARCHITECTURE.md`: `mfe-bi-next` en vez de `mfe-bi-vue`, sin `ms-reservations-dynamo`, actores y roles nuevos (CLIENTE / EMPLEADO + sector / ADMIN), `ms-ml-python` planificado.
- [x] **SSO con Keycloak (CU07)**
  - [x] Keycloak 24 en Docker (`docker compose up -d keycloak-sso`), consola en http://localhost:8080 (usuario `admin`, ver `docker-compose.yml`)
  - [x] Realm `habitat` versionado en `keycloak/habitat-realm.json` y se importa solo al arrancar: roles `CLIENTE` / `EMPLEADO` / `ADMIN`, atributo `sector` (AGENTE / LEGAL / FINANZAS / ATENCION) dentro del token, auto-registro como CLIENTE, cliente público `habitat-web` con PKCE
  - [x] Usuarios demo (contraseña `pass123`): juan.comprador (CLIENTE), carlos.broker (EMPLEADO/AGENTE), elena.ramos (EMPLEADO/LEGAL), maria.finanzas (EMPLEADO/FINANZAS), admin (ADMIN) — todos `@habitat.pro`
  - [x] Probado: los 5 usuarios obtienen un token con el rol y el sector correctos
  - [x] ms-contracts valida tokens de Keycloak (Spring Security resource server):
    - `POST /api/v1/auth/sso` sincroniza el perfil del token en PostgreSQL (lo crea si es nuevo; conserva los IDs existentes)
    - `GET/PUT /api/v1/users/**` solo para ADMIN
    - Se eliminaron `/auth/login` y `/auth/register` (las contraseñas ahora las maneja Keycloak)
  - [x] Modelo `User`: rol `CLIENTE` / `EMPLEADO` / `ADMIN` + `sector` + `keycloak_id`, sin contraseña
  - [x] **Base de Render migrada** (automático al arrancar ms-contracts): AGENTE/LEGAL → EMPLEADO + sector, y se borró la columna `password_hash`, que guardaba contraseñas en texto plano
  - [x] Gateway (`server.js`): `/api/auth/sso` y reenvío del token a `/api/users`; el health check ya no usa `/users`
  - [x] Shell: login y registro con `keycloak-js` (PKCE); el token se adjunta solo a toda llamada al API, también desde los microfrontends; renovación automática; cierre de sesión en Keycloak
  - [x] Shell: menú para los sectores nuevos (FINANZAS = Cajero, ATENCION); la vista de usuarios muestra rol + sector en solo lectura (CU08 hará la edición vía la API de Keycloak)
  - [x] `start-all.ps1` levanta Keycloak; se borró `mfe-shell/src/auth/keycloak-auth.js`, que era una simulación
  - [x] Probado por API: los 5 usuarios entran y obtienen su perfil; sin token → 401; CLIENTE pidiendo `/api/users` → 403; token falso → 401
  - [x] Probado en el navegador (login, registro, cierre de sesión)
  - [x] **BI (Next.js) como app separada en http://localhost:3003** con la misma sesión: si ya entraste al ERP, abre sin pedir contraseña. Solo lo ven ADMIN y el sector FINANZAS. En el shell hay un botón "📊 Dashboard BI ↗" para ADMIN y Finanzas. `start-all.ps1` también lo levanta.
  - [ ] Probar en el navegador el salto ERP → BI sin volver a iniciar sesión

> ⚠️ **Para tus compañeros:** después de hacer pull tienen que recompilar ms-contracts (`mvn package -DskipTests`), crear `ms-contracts-spring/.env` (ver `.env.example`) y tener Docker abierto para Keycloak. El código viejo ya no funciona con la base migrada. Quien tenía una cuenta creada con el registro anterior (por ejemplo `josueurquidicarrillo@gmail.com`) debe registrarse de nuevo en Keycloak **con el mismo email**: se vincula solo a su perfil.
- [x] **Gateway (`server.js`) valida el token** (librería `jose`): toda ruta `/api` exige sesión, salvo `GET /api/properties` (catálogo público) y `/api/health`. El token se reenvía solo a los microservicios en cada llamada, incluidos los pasos y compensaciones de la saga.
- [x] **ms-properties (NestJS) valida el token**: guard global; las lecturas (GET) son públicas y todo lo que modifica datos exige un token válido.
- [x] **ms-billing (PHP) valida el token** sin librerías: verifica la firma RS256 con las claves públicas de Keycloak (caché de 10 min), el emisor y la expiración. Todo menos `/health` exige token.
- [x] Probado por API: sin token → 401 en las 3 capas; con token → 200; token falso → 401; **token alterado para hacerse pasar por ADMIN → 401**. La saga reenvía el token: al reservar un inmueble vendido, ms-properties rechaza por la regla de negocio ("estado COMPRADO"), no por autenticación.
- [ ] Probar en el navegador una reserva completa (saga) con el token. Ahora los 3 inmuebles están comprados o reservados; como ADMIN, usa "Reabrir catálogo" y reserva como juan.

> 📌 **Pendiente para fases siguientes:**
> - Por ahora el backend exige **sesión**, pero todavía no **rol por endpoint**: cualquier usuario con sesión puede llamar `/api/finances`, aunque la interfaz lo oculte. Los permisos por rol se agregan en la Fase 1, junto con cada CU.
> - **n8n** llama al gateway sin token: hay que crearle un cliente de servicio en Keycloak (client credentials) cuando se haga CU14 / CU20 / CU21.

**✅ Fase 0 terminada** (falta solo la prueba en el navegador del salto ERP → BI y de una reserva completa)

> ⚠️ **Acción para el equipo:** la contraseña de MongoDB Atlas y la de PostgreSQL (Render) estuvieron escritas en el código y siguen en el historial de git. Conviene **cambiarlas** en Atlas y Render, y después actualizar los `.env`. Si algún servicio está desplegado en la nube, hay que configurarle las variables `MONGO_URI` / `SPRING_DATASOURCE_*` en el hosting antes de volver a desplegar.

---

## Fase 1 — Completar lo existente + arquitecturas · 1–4 nov

### Integrante 1 — Catálogo
- [x] **CU02: registrar y editar inmuebles**
  - `POST /api/v1/properties` ahora valida con `CreatePropertyDto` (mensajes en español) y `PATCH /api/v1/properties/:id` edita con `UpdatePropertyDto`; el código no se puede cambiar
  - Solo AGENTE y ADMIN (decorador `@Roles` en ms-properties). Reabrir un inmueble: ADMIN/AGENTE. Reabrir todo el catálogo: solo ADMIN
  - El asesor (`brokerName`) se toma del token de quien registra
  - Se corrigió un error previo: el formulario "Publicar inmueble" del shell enviaba campos con otros nombres (`baths`, `area`…) y el alta fallaba. El formulario ahora vive en el microfrontend React, con mapa para marcar la ubicación (clic o "usar mi ubicación")
- [!] CU02: subir fotos y planos a Amazon S3 — **lo hará tu amigo con su cuenta de AWS**. Mientras tanto, las fotos se cargan como URLs (una por línea)
- [x] **CU01: búsqueda por cercanía**
  - Se agregó el índice `2dsphere`, que faltaba: sin él, `$near` fallaba y el código lo ocultaba devolviendo todo el catálogo
  - `$geoNear` devuelve la distancia de cada inmueble; el gateway expone `GET /api/properties/search/geo` (público)
  - Botón "📍 Cerca de mí" con radio de 2 a 50 km; la distancia se ve en cada tarjeta
- [x] **CU01: ficha de detalle**: galería, mapa (Leaflet + OpenStreetMap), descripción, comodidades, expensas, recorrido 3D; botones para agendar visita, reservar y editar
- [x] **CU01: consultas de clientes**
  - Colección `inquiries` en MongoDB; el cliente pregunta desde la ficha
  - Pestaña "💬 Mis consultas" (cliente) y "💬 Consultas de clientes" (agente / atención / admin) para responder
  - Los datos del cliente salen del token (no se pueden falsear); el cliente solo ve las suyas; LEGAL y FINANZAS no tienen acceso
- [x] CU01: filtros de ciudad y tipo armados con los datos reales (antes eran 3 ciudades fijas); búsqueda por ciudad protegida contra caracteres especiales
- [x] Probado por API: alta y edición (agente ✓, cliente 403, datos inválidos 400 con mensajes), cercanía con distancias reales (La Paz 0 km, Cochabamba 226 km, Santa Cruz 540 km), consulta → respuesta → el cliente la ve; responder dos veces 409. El microfrontend se renderiza sin errores (prueba de humo con React)
- [x] Probado en el navegador: ficha con mapa, "Cerca de mí", publicar/editar y consultas

> 📌 Para las pruebas se creó un inmueble real de ejemplo, **DEP-UJOB** ("Departamento Moderno en Equipetrol Norte", Santa Cruz, DISPONIBLE), con una consulta de juan ya respondida por carlos. Sirve para la demo, porque los otros 3 inmuebles estaban vendidos o reservados.

### Integrante 2 — Usuarios, visitas y contratos
- [x] **CU08 backend: gestión de empleados (solo ADMIN)** vía la API de administración de Keycloak
  - Cuenta de servicio `habitat-admin-api` en el realm; su secreto viene del `.env` (no está en el JSON versionado)
  - `GET/POST /api/v1/employees`, `PATCH /{id}/sector`, `POST /{id}/deactivate|activate`
  - Alta con contraseña temporal (debe cambiarla al primer login); la baja deshabilita la cuenta en Keycloak y cierra sus sesiones
- [x] **Permisos por rol en ms-contracts**: cada token se traduce a un solo rol efectivo (ADMIN / sector / CLIENTE), así un empleado no puede actuar como cliente
- [x] **CU09/CU10 backend: visitas**
  - El cliente se toma del token (antes venía del formulario y se podía falsear)
  - Validación de fecha (no pasada), horario 08:00–19:00 y horario ya ocupado (409)
  - El cliente ve y cancela solo las suyas; solo AGENTE/ADMIN gestionan la agenda; las visitas completadas o canceladas no se modifican
  - Se corrigió un error previo: el id `VIS-` era un número al azar de 4 cifras, y si se repetía se sobrescribía otra visita
- [x] **CU11 backend: contratos**
  - Solo LEGAL/ADMIN generan y anulan (la anulación exige motivo)
  - No se permiten dos contratos activos sobre el mismo inmueble (409)
  - El cliente ve solo los suyos, filtrados en el servidor
- [x] **CU12 backend: firma digital (simulada)**
  - Tabla `contract_signatures`: firmante, rol, fecha y hash SHA-256 del contenido del contrato
  - Firman el cliente titular y el Oficial Legal (fe pública); con ambas firmas queda FIRMADO
  - Se eliminó el hash inventado al azar en el gateway y el texto fijo "1 de 3 firmas"
- [x] **BFF GraphQL del ERP** (`bff-graphql-gateway`, puerto 4000, expuesto como `/api/graphql` en el gateway)
  - Esquema nuevo: contratos con su inmueble anidado (un solo pedido a ms-properties por consulta, sin N+1), firmas, empleados, clientes y agenda
  - 7 mutaciones; reenvía el token y traduce los errores REST a errores GraphQL (FORBIDDEN, BAD_REQUEST…)
- [x] Keycloak guarda sus datos en un volumen (antes, al recrear el contenedor se perdían los usuarios creados)
- [x] Probado por API y GraphQL: alta / cambio de sector / baja (la cuenta dada de baja no puede entrar) / reactivación; visitas (pasado 400, 22:00 400, horario ocupado 409, LEGAL 403); contratos (AGENTE 403, duplicado 409, firma cliente → firma legal → FIRMADO, anular sin motivo 400)
- [~] **ERP Angular real consumiendo GraphQL** — `mfe-contracts-angular` **no era Angular**: era JavaScript puro con un `.ts` de Angular que nunca se compilaba. Se rehace con Angular + Angular Elements (contratos, empleados y agenda)

> 📌 Se creó la empleada **Lucía Fernández** (`lucia.atencion@habitat.pro`, sector ATENCION, contraseña temporal `Temporal123`), porque no había ningún usuario de Atención. Al primer login Keycloak le pide cambiar la contraseña.

### Integrante 3 — Reservas y finanzas
- [x] **CU14: confirmación de reserva por Telegram (n8n)** — probado: el mensaje llega a @habitatPro_bot
  - Flujo `n8n/habitat_reserva_telegram.json`: webhook protegido con `X-Habitat-Secret` (sin el secreto → 403) → nodo Telegram
  - Al terminar bien la saga, el gateway avisa al webhook; si n8n falla, la reserva **no** se revierte (`telegramNotification` en la respuesta)
  - Token, secreto y chat id en el `.env` de la raíz (no versionado); pasos para otra PC en `n8n/README.md`
  - Se renombró a `proptech-n8n-old` un contenedor n8n viejo que ocupaba el nombre (no se borró nada)
- [x] **CU15: cancelar reserva con reembolso** — solo el cliente titular, el Cajero (FINANZAS) o el ADMIN
  - Orden: reembolso → cerrar la reserva → **anular el pre-contrato de arras** (antes quedaba activo y el inmueble no se podía volver a reservar) → liberar el inmueble
  - Solo reservas ACTIVA (409 si no); reembolsar dos veces no duplica; el Cajero registra un motivo
  - El titular de la reserva sale del token (antes venía del formulario y se podía falsear); el cliente solo ve sus reservas
- [x] **CU16: cobros en caja** (pantalla "💰 Caja & Comisiones" del Cajero, microfrontend `<mfe-bi>`)
  - Lista los contratos de compraventa / arrendamiento **firmados**; compraventa → saldo (precio − anticipo); arrendamiento → canon mensual por mes (AAAA-MM)
  - El monto lo calcula el servidor desde el contrato; registrar dos veces el mismo saldo o la misma cuota → 409
  - Al pagar el saldo (o la primera cuota): inmueble COMPRADO / ALQUILADO, reserva cerrada y **comisión del agente generada sola**
  - Los pagos van al libro `HabitatCharges` (no se creó ninguna tabla nueva). Se quitó el botón "Formalizar compra" del cliente: la compra se cierra en caja
- [x] **CU17: liquidar comisiones** — el Cajero las ve (pendientes / pagadas) y las paga con referencia (PENDIENTE_PAGO → PAGADA; pagar dos veces → 409)
  - Regla: 3% del valor de la operación (venta, o 12 meses de alquiler) menos 13% de retención
  - El agente es quien publicó el inmueble (nuevo campo `brokerEmail`); si no, el del contrato
- [x] **CU18: mis comisiones** — el agente ve solo las suyas (su id sale del token; ms-billing además filtra por su email)
- [x] Permisos por rol en ms-billing (antes cualquier usuario con sesión podía llamar todo, por ejemplo `/finances`)
- [x] ms-billing ya no ignora los errores de DynamoDB: antes la saga daba por bueno un cobro aunque AWS lo rechazara
- [x] Resumen financiero calculado con datos reales (antes tenía montos fijos, por ejemplo $1.145.000)
- [x] Se corrigió otro id al azar de 4 cifras: `RES-` y `ARRAS-` ahora usan UUID (si se repetía, se sobrescribía otra reserva)
- [x] **Probado por API de punta a punta (40 verificaciones OK):**
  - Permisos: agente reserva 403, cliente `/finances` 403, llamadas directas a ms-billing con rol equivocado 403
  - CU15: la reserva queda a nombre de juan aunque mande otro `userId`; agente/legal no cancelan (403); cancela → reembolso + pre-contrato anulado + inmueble DISPONIBLE; cancelar otra vez 409; reembolso doble sin duplicar
  - CU16: cobrar sin firmas 409 → firma cliente + legal → caja muestra saldo $112.500 (125.000 − 12.500) → cobro → inmueble COMPRADO, reserva COMPRADA, comisión de Carlos $3.262,50; cobrar dos veces 409
  - CU17/18: Carlos ve su comisión pendiente; no puede liquidarse a sí mismo (403); Cajero liquida → PAGADA; dos veces 409
  - Al final se anularon los contratos de prueba (CTR-AACFFD32, ARRAS-6C99DE37) y DEP-UJOB volvió a DISPONIBLE
- [ ] Probar en el navegador: "💰 Caja & Comisiones" (maria.finanzas), "💼 Mis Comisiones" (carlos.broker) y cancelar desde "📋 Mis Reservas" (juan)

> 📌 **Datos de prueba que quedaron en DynamoDB (historial):** reservas RES-5922 (cancelada) y RES-7784 (comprada), cobro `BAL-CTR-AACFFD32` ($112.500) y comisión `COM-CTR-AACFFD32` (pagada). Suben los totales de la caja; si molestan para la demo se pueden borrar de las tablas.

> ⚠️ **Para tu amigo (despliegue):**
> - Recompilar ms-contracts (`mvn package -DskipTests`) y ms-properties (`npm run build`); ms-billing tiene archivos nuevos en `src/Http/` y `src/Services/DynamoException.php`
> - Gateway: variables opcionales `N8N_RESERVATION_WEBHOOK_URL` y `N8N_WEBHOOK_SECRET` (sin ellas la reserva funciona, solo no avisa por Telegram)
> - n8n: importar `n8n/habitat_reserva_telegram.json` y cargar las 2 credenciales (ver `n8n/README.md`); `TELEGRAM_CHAT_ID` en el entorno de n8n
> - Se quitó la ruta `POST /api/reservations/:id/buy` (la compra ahora se cierra en caja con `POST /api/payments`)

---

## Rediseño visual (solo diseño, sin cambiar funcionalidad) · 02/11
- [x] **Sistema de diseño en el shell:** base gris neutra (zinc), un solo acento azul `#1d4ed8`, bordes de 1px, sin gradientes, títulos en 600 (nada en 800). Se mantienen los nombres de variables y clases, así que el ERP Angular y Caja cambiaron solos
- [x] **Íconos Lucide en vez de emojis:** se pasó de unos 160 emojis a 0. Una sola fuente para todos (`window.HabitatIcons` en el shell): `Icon` en React, `<erp-icon>` en Angular
- [x] **Textos de negocio en vez de jerga técnica:** antes "Bloqueo Saga temporal 48h", "Listados activos en MongoDB"; ahora "Reservados · vencen en 48 h", "En cartera"
- [x] **Modo demo para el docente:** `?demo=1` marca cada microfrontend con su tecnología y su servicio (React → ms-properties, Angular + GraphQL → ms-contracts, Next → ms-billing); `?demo=0` lo apaga
- [x] **Métricas compactas** en una franja (`.stat-strip`); estados con `.status-pill` iguales en las 3 tecnologías
- [x] Pantallas: login, encabezado, menú, catálogo, ficha, formulario de inmueble, consultas, reservas, reportes, modales de visita y reserva, contratos, empleados, agenda, caja, mis comisiones y la app BI de :3003
- [x] `CLAUDE.md` con la guía de diseño, para que el equipo mantenga el estilo
- [x] Verificado: 0 emojis y 0 gradientes en los archivos de frontend; los `id`, `onclick` y eventos del shell y los handlers del catálogo son idénticos a los de antes; el ERP Angular compila; la app BI compila
- [ ] Revisar en el navegador con cada rol (Ctrl+F5)

> ⚠️ **Para tu amigo (despliegue):** el ERP Angular se recompiló (`dist/browser/main.js`). El shell ahora carga Lucide desde `unpkg.com/lucide@0.460.0`.

## Fase 2 — IA, ML y datos · 4–7 nov
- [ ] 2.1 CU20: Claude real + servidor MCP + exportar a `.xlsx`
- [ ] 2.2 Modelo de lectura consolidado para CU19 / CU20 (quitar valores fijos del dashboard)
- [ ] 2.3 CU21: agente monitor (cron n8n → tools MCP → Claude → Telegram)
- [ ] 2.4 `ms-ml-python` + CU13 K-means
- [ ] 2.5 CU03 random forest
- [ ] 2.6 CU04 COCO-SSD en el navegador

## Fase 3 — Móvil y offline · 6–9 nov
- [ ] PWA: `manifest.json` + Service Worker + responsive
- [ ] CU22: offline (catálogo guardado + cola IndexedDB + `Idempotency-Key`)
- [ ] `Idempotency-Key` en visitas/acta (Spring) y reservas (`server.js`)
- [ ] CU06: notificaciones push
- [ ] CU05: asistente de ayuda offline (MiniLM)

## Refactors de arquitectura (al final, decisión del equipo)
Son internos a cada microservicio: no cambian rutas, JSON ni datos. Al terminar cada uno se repiten las pruebas por API para confirmar que nada se rompió.
- [ ] **DDD en ms-properties:** agregado `Property` con las reglas (reservar, liberar, confirmar), value objects `Price` / `Location`, evento `PropertyReserved`, repositorio
- [ ] **Hexagonal en ms-contracts:** dominio sin Spring, puertos (`ContractRepositoryPort`…) y adaptadores (JPA, REST)
- [ ] **Clean en ms-billing:** casos de uso (`ChargeArras`, `RefundArras`, `RegisterRentPayment`), entidades e interfaces hacia afuera

## Fase 4 — Cierre · 9–10 nov
- [ ] ICONIX de cada CU (descripción, robustez, secuencia) + modelo de dominio
- [ ] Diagramas de las 4 arquitecturas
- [ ] Restringir CORS + pruebas críticas
- [ ] Guion de demo
