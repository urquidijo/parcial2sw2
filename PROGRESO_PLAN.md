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
- [x] **2.1 CU20: reporte por voz o texto con Claude + MCP + Excel** — probado con Claude real: "inmuebles disponibles en Santa Cruz con su precio" → Claude usó `consultar_inmuebles(ciudad=Santa Cruz, estado=DISPONIBLE)`, devolvió resumen y tabla en 3,4 s por **USD 0,0007** (5.248 tokens de entrada + 315 de salida)
  - **Servidor MCP nuevo** (`mcp-habitat-server/`, puerto 4100, SDK oficial de MCP v1): 7 herramientas de solo lectura (inmuebles, resumen de cartera, contratos, visitas, reservas, finanzas, comisiones) con parámetros validados. Usan el token de quien pide el reporte, así cada rol ve solo lo que le corresponde
  - **Gateway como cliente MCP** (`ai/report-agent.js`): le pasa a Claude las herramientas del servidor MCP, ejecuta las que pida y termina con `entregar_reporte`. **Anti inyección:** Claude no escribe SQL ni consultas libres, y la tabla sale de los datos reales de una herramienta (Claude solo indica cuál), así no puede inventar filas
  - **Modelo barato:** Claude Haiku 5.5 con esfuerzo bajo (`CLAUDE_MODEL` en el `.env`); un reporte cuesta del orden de una décima de centavo de dólar
  - **Shell:** título, resumen y tabla con nombres de columna; **exportar a Excel (.xlsx)** con hoja de resumen y hoja de datos; el dictado por voz ya existía
  - Probado: las 7 herramientas con datos reales; validación (estado inventado → rechazado); AGENTE pidiendo finanzas → sin acceso; MCP sin token → 401; CLIENTE pidiendo reporte → 403; pedido vacío → 400
  - La clave vieja de `CLAUDE_API_KEY` estaba vencida; se reemplazó por una nueva (03/11)
  - `start-all.ps1` levanta el servidor MCP (requiere `npm install` en `mcp-habitat-server`)
- [x] **2.2 Modelo de lectura consolidado (CU19 / CU20 / CU21)** — el lado de lectura de CQRS: un solo resumen que cruza MongoDB (inmuebles, consultas), PostgreSQL (visitas, contratos) y DynamoDB (cobros, reservas, comisiones)
  - **`bi/read-model.js`** (función pura) + **`GET /api/bi/overview`** en el gateway (Admin y Finanzas). Se guarda en memoria 60 s y cualquier escritura que termine bien lo invalida. No se creó ninguna tabla ni se tocaron las bases
  - Calcula: ingresos del mes y variación, valor de la cartera, arras en custodia, comisiones por pagar, **días promedio de cierre** (de la reserva a la última firma), **embudo de 90 días** (visitas → reservas → contratos firmados), ingresos por mes (6 meses), cartera por estado y ciudad, top de agentes y pendientes (mismos criterios del monitor). Si un servicio no responde, solo esa parte sale vacía y se avisa
  - **Dashboard BI (`localhost:3003`)**: pestaña nueva **"Resumen"** con indicadores, gráfico de barras apiladas de ingresos por mes (con tooltip y "Ver como tabla"), embudo, cartera, agentes y "Requiere atención". El "Libro mayor" quedó igual en su pestaña
  - **Herramienta MCP `resumen_negocio`** (la 10.ª): Claude la usa primero para totales y tendencias. Prueba real de CU20, "¿cómo van los ingresos por mes y comparado con el mes pasado?": **1 sola llamada** (antes eran 2–3), 7.211 + 353 tokens (~USD 0,001)
  - Probado por API: admin 200, finanzas 200 (sin consultas de clientes, que no le corresponden: se avisa), agente 403, sin token 401; segunda llamada desde la caché en 5 ms (la primera tarda 2,8 s); `?fresh=1` recalcula
  - Nota de datos: hay 7 reservas y solo 2 visitas registradas (las reservas de demo se hicieron sin agendar visita), por eso el embudo muestra "—" en esa conversión en lugar de 350 %
  - [ ] Probar en el navegador: admin → Dashboard BI → pestaña Resumen

> ⚠️ **Para tu amigo (despliegue):** el gateway tiene una carpeta nueva `bi/`, que ya está en el `Dockerfile` (`COPY bi ./bi`). Hay que redesplegar el gateway, el servidor MCP (herramienta nueva) y el BI de Vercel. No se necesitan variables nuevas.
- [x] **Ciudad y zona con listas desplegables** en "Publicar / Editar inmueble": salen de las zonas que conoce el modelo de precios (`GET /api/ml/locations`), con la opción "Otra…" para escribir. Así la estimación de precio reconoce siempre la zona
- [x] **Vinculación de Telegram por empleado** (base para CU21)
  - Telegram no permite que un bot escriba a un número de teléfono: la persona tiene que abrir el bot y pulsar "Iniciar". Por eso cada empleado pulsa **"Conectar Telegram"** en el encabezado → se abre `t.me/habitatPro_bot?start=<código>` → pulsa Iniciar → la app lo confirma sola y el bot le manda un mensaje
  - En **"Empleados"** (ERP Angular) el Admin ve quién tiene Telegram vinculado y activa **"Recibe alertas"** por empleado. No se puede activar a quien no se vinculó (409). El Administrador recibe alertas al vincularse
  - En PostgreSQL (Render) se agregaron 2 columnas a `users`: `telegram_chat_id` y `telegram_alerts`. Las creó Spring al arrancar, vacías; no se tocaron datos. El chat id nunca se expone en el JSON, solo `telegramLinked`
  - Probado por API: cliente 403, link generado con el bot real, verificar antes de pulsar Iniciar → pendiente, código de otro usuario 403, código inventado 410, GraphQL con los campos nuevos
  - [ ] Probar en el navegador: "Conectar Telegram" → Iniciar en el bot → "Telegram vinculado"; luego como admin activar "Recibe alertas"
- [~] **2.3 CU21: agente monitor del negocio ("monitorea mi negocio")** — Claude Haiku + herramientas MCP revisa el negocio y entrega alertas priorizadas con acción sugerida y responsable
  - **Habilidades del agente** (herramientas MCP, solo lectura): reservas (horas para vencer), contratos (días sin firmar), **cobros pendientes** (nueva: saldos y cuotas atrasadas), comisiones (días sin pagar), **consultas de clientes** (nueva: horas sin responder) y visitas. El agente decide cuáles usar y prioriza: alta (reserva vence en < 24 h, cuota atrasada, consulta > 48 h), media, baja
  - **Campanita** en el encabezado (todo el personal): contador de alertas nuevas, último resumen y las 6 revisiones anteriores; el Admin tiene **"Revisar ahora"**. Cada revisión se guarda en la tabla nueva `monitor_reports` (PostgreSQL)
  - **Telegram vía n8n** (`n8n/habitat_monitor_cu21.json`): cada mañana a las 08:00 pide la revisión al gateway y envía un mensaje a cada empleado con Telegram vinculado y "Recibe alertas" activo
  - Probado con Claude real: revisión en 23 s por **USD 0,0016**; usó 6 herramientas y encontró 3 pendientes reales (2 pre-contratos de arras duplicados sin firmar en DEP-VALLE-101, un saldo de compra sin fecha de firma, la comisión de Carlos con 17 días sin pagar). Permisos: agente 403, cliente 403; webhook de n8n sin secreto 403; envío de prueba por Telegram OK
  - [x] **Cuenta de servicio `habitat-monitor` creada en Keycloak** (04/11). Probada la revisión programada, la misma llamada que hace n8n a las 08:00: el gateway obtuvo el token de la cuenta, el agente usó 7 herramientas (incluida `resumen_negocio`) y entregó 2 alertas medias reales, guardadas en la campanita. Telegram: 1 de 1 enviado. Costo: 9.131 + 1.337 tokens
  - [ ] Probar en el navegador: campanita como admin → "Revisar ahora"; vincular Telegram, activar "Recibe alertas" y volver a revisar (llega el mensaje)

> 📌 **Cuenta de servicio del monitor:** para la revisión programada, n8n no usa credenciales de Keycloak; llama al gateway con el secreto del webhook y el gateway pide el token de la cuenta de servicio `habitat-monitor` (rol ADMIN). Está declarada en `keycloak/habitat-realm.json` (se importa en un Keycloak nuevo); para un Keycloak que ya existe: poner `KEYCLOAK_MONITOR_CLIENT_SECRET` en el `.env` y correr `node keycloak/add-monitor-client.js`
- [x] **2.4 `ms-ml-python` + CU13 segmentación de clientes (K-means, no supervisado)** — microservicio nuevo en FastAPI (puerto 8003) que valida el token de Keycloak
  - 900 clientes sintéticos con 4 perfiles; montos con log + `StandardScaler` (si no, el presupuesto aplasta al resto de variables)
  - k = 4 elegido por el **método del codo** (la inercia baja ~30 % por grupo hasta 4 y luego ~11 %); silhouette 0,445, prácticamente igual a la de k = 3
  - Encontró los perfiles sin conocerlos: **ARI = 0,93** con *Inversionista, Primera vivienda, Inquilino, Curioso*
  - **Pestaña "Segmentos" del Admin:** el gateway calcula la actividad real de cada cliente (visitas, consultas, reservas, contratos) y el modelo lo clasifica. Hoy: Juan = Primera vivienda, Josue = Curioso. Incluye el gráfico del codo, silhouette y PCA
- [x] **2.5 CU03 precio con random forest (supervisado)** — 3.000 inmuebles sintéticos con una regla de mercado documentada (USD/m² por ciudad y zona, tipo, ambientes, ±10 % de ruido)
  - **R² = 0,89** en prueba (0,91 en validación cruzada de 5), error medio 14,5 %. Lo que más pesa: superficie 58 %, zona 21 %
  - **Botón "Estimar precio"** en el formulario de publicar o editar inmueble: precio sugerido, rango probable (percentiles 10–90 de los 200 árboles) y "Usar este precio". Si la zona no se conoce, avisa y usa el promedio de la ciudad
  - Ejemplo: departamento de 96 m² en Equipetrol → USD 148.000 (rango 134.500–162.500); el mismo en Calacoto → 175.000; en Plan 3000 → 61.500
- [x] **Evidencia para el docente:** notebooks ejecutados con explicación, métricas y gráficos: `ms-ml-python/notebooks/CU03_precio_random_forest.ipynb` y `CU13_segmentacion_kmeans.ipynb`
- [x] Probado por API: predicción (agente ✓, cliente 403, legal 403, datos inválidos 422), segmentos (admin ✓, agente 403), métricas sin token 401, gráficos públicos
- [ ] Probar en el navegador: "Estimar precio" (carlos.broker → Publicar inmueble) y "Segmentos" (admin)

> ⚠️ **Para tu amigo (despliegue):** `ms-ml-python` es un servicio nuevo (Dockerfile listo; entrena los modelos al construir). El gateway necesita `ML_SERVICE_URL`. Para correrlo en local, cada compañero crea el entorno de Python (ver `ms-ml-python/README.md`).

- [x] **Corregido:** el modal "Agendar visita" enviaba la hora como "09:30 AM" y el backend la rechazaba. Ahora envía formato 24 h, y ms-contracts responde 400 con un mensaje claro ante una fecha u hora mal escrita
- [x] **2.6 CU04 autocompletar la ficha desde fotos (Deep Learning + IA local)** — TensorFlow.js + COCO-SSD corren **en el navegador** del agente (PC o celular): las fotos no salen del dispositivo y no cuesta nada
  - En "Publicar / Editar inmueble" → **"Autocompletar desde fotos"**: el agente elige fotos, ve los recuadros de lo detectado ("cama 95 %", "inodoro 90 %") y recibe sugerencias que confirma con casillas: dormitorios (una foto con cama = un dormitorio), baños (una foto con inodoro = un baño), parqueos (autos), comodidades "Cocina equipada" y "Amoblado"
  - **Peso:** el modelo original pesa 17,2 MB; se **cuantizó a 8 bits** (`mfe-properties-react/tools/quantize-model.js`) y quedó en **4,8 MB**, servido desde el propio microfrontend. Con TensorFlow.js (~0,4 MB comprimido) se descarga **solo al usar el botón** y queda en caché
  - Precisión comprobada contra el original con 4 fotos (dormitorio, baño, cocina, sala): detectan lo mismo (cama 95 %/95 %, inodoro 90 %/90 %, silla 98 %/94 %); solo cambian detecciones dudosas (< 55 %), que se descartan con el umbral del 50 %
  - Límites: COCO-SSD no reconoce piscina, balcón o jardín, y puede fallar con fotos oscuras; por eso solo sugiere y el agente confirma
- [ ] Probar en el navegador: carlos.broker → Publicar inmueble → "Autocompletar desde fotos" con fotos de dormitorio, baño y cocina

## Fase 3 — Móvil y offline · 6–9 nov
- [x] **3.1 PWA instalable + móvil**
  - `mfe-shell/manifest.webmanifest`, íconos de `mfe-shell/icons/` (los genera `tools/make-icons.ps1`), y `mfe-shell/sw.js`, un Service Worker escrito a mano.
  - Qué guarda el Service Worker:
    - la app y los microfrontends;
    - las librerías de CDN con versión fija (React quedó fijado en 18.3.1);
    - el catálogo y las ciudades/zonas (primero intenta la red; si no hay, usa la copia guardada);
    - las fotos (hasta 200).
  - Nunca guarda escrituras, sesión, IA ni finanzas.
  - Botón **"Instalar app"** y aviso "Hay una versión nueva → Actualizar".
  - En el **celular (≤ 640 px)**:
    - la navegación pasa a una **barra inferior**;
    - los modales ocupan toda la pantalla;
    - las zonas táctiles miden 44 px;
    - los campos usan letra de 16 px, para que iPhone no haga zoom.
  - Corregido durante las pruebas: dos escrituras simultáneas en la caché ("Entry already exists") rompían la vuelta del login de Keycloak. Ahora guardar en caché nunca rompe una respuesta.
- [x] **3.2 `Idempotency-Key`** (`idempotency/middleware.js`, en el gateway, la puerta única)
  - Rutas: reservar (saga de arras), cancelar con reembolso, agendar visita, consulta y cobro en caja.
  - El shell pone la clave a toda escritura y la reutiliza si el mismo pedido sigue en curso o se perdió la respuesta (doble toque, mala señal). Al recibir la respuesta la libera, para que "reservar → cancelar → reservar" no reciba la respuesta vieja.
  - Comportamiento ante una clave ya usada:
    - mismo pedido → misma respuesta, sin volver a ejecutar (`Idempotent-Replayed: true`);
    - mientras sigue en curso → 409;
    - misma clave con otro pedido → 422;
    - error 5xx → se puede reintentar.
  - Probado con un DynamoDB simulado: 7 de 7 casos correctos, y solo se ejecutaron las operaciones que debían.
  - Si DynamoDB no responde, la petición sigue normal y queda en el log.
  - [x] Tabla `habitat_idempotency` creada en DynamoDB por el usuario (05/11) con `node scripts/create-idempotency-table.js` (pago por uso, TTL de 24 h). **Probado contra DynamoDB real:** el pedido repetido devolvió la respuesta guardada (`Idempotent-Replayed: true`) sin ejecutarse otra vez, y la misma clave con otro pedido dio 422
- [x] **3.3 CU22 sin conexión**
  - Sin red, la app abre en **modo lectura** con el último perfil guardado (nunca el token) y el **catálogo guardado**, con el aviso "Estás viendo el catálogo guardado el dd/mm hh:mm".
  - **Agendar visita** y **enviar consulta** se guardan en una cola en IndexedDB (`mfe-shell/src/pwa/offline-queue.js`), cada una con su Idempotency-Key.
  - **Reservar, cancelar, cobrar y firmar no se encolan:** mueven dinero o compiten por el inmueble, así que piden conexión.
  - Botón **"Pendientes (n)"**, con la lista y la opción de descartar.
  - Al volver la red aparece **"Reconectar"**. Al iniciar sesión, la cola se envía sola; si el servidor rechaza algo, se avisa el motivo.
  - **Probado en Chrome real** (sin ventana, con DevTools): instalable; caché de app, librerías, catálogo y fotos; recarga sin red en modo lectura con 5 inmuebles; consulta sin red → en cola (202); reserva sin red → 503 con mensaje claro; al reconectar la cola se vació sola.
  - El borrador anterior `mfe-shell/src/pwa/offline-sync-manager.js` (nunca se cargaba) queda reemplazado; se puede borrar.
  - [ ] Probar en el navegador: DevTools → Application (manifest + Service Worker) y Network → "Offline"
- [x] **3.4 CU06 notificaciones push de reservas** (Web Push + VAPID; llegan aunque la app esté cerrada)
  - **ms-contracts:**
    - tabla nueva **`push_subscriptions`** en Render, que Spring creó vacía al arrancar (05/11);
    - `PUT/DELETE /users/me/push`: cada usuario registra o quita su dispositivo, y el dueño sale del token;
    - `GET/DELETE /push/subscriptions`: solo ADMIN, es decir, la cuenta de servicio del gateway.
  - **Gateway** (`push/notify.js` + `web-push` 3.6.7):
    - avisos de **reserva confirmada**, **reserva cancelada/reembolsada** y **reserva por vencer** (menos de 6 h; se revisa cada 30 min, un solo aviso por reserva);
    - los avisos van en segundo plano: si fallan, no frenan la operación;
    - los dispositivos que ya no existen (404/410) se borran solos;
    - el token de la cuenta de servicio `habitat-monitor` se reutiliza hasta que vence (`serviceAuthorization()`), y lo comparte con el monitor de las 08:00.
  - **App:**
    - en "Mis reservas", bloque **"Avisos en este dispositivo"** con "Activar avisos", "Desactivar" y "Probar aviso";
    - explica los casos de iPhone sin instalar, navegador sin soporte o permiso bloqueado;
    - al tocar el aviso se abre la app en Reservas.
  - Probado por API: suscribir OK, suscripción inválida rechazada, un cliente leyendo las de otros → 403, borrar OK, sin sesión → 401. La suscripción de prueba se borró.
  - [x] Claves VAPID generadas por el usuario con `node scripts/gen-vapid.js` y guardadas en el `.env` (05/11)
  - [x] **Probado en el navegador por el usuario (Chrome, PC):** "Activar avisos" → "Probar aviso" → llegó la notificación de Windows "Habitat Pro · Los avisos están activos en este dispositivo"
  - Para probar en un **Android sin desplegar:** reenvío de puertos USB de Chrome (`chrome://inspect` → Port forwarding 5000 y 8080). Así `localhost` del celular apunta a la PC y el login de Keycloak funciona. Un túnel tipo trycloudflare no alcanza: cambia el emisor de los tokens y la dirección de vuelta del login. En iPhone hace falta HTTPS real (el despliegue) y la app instalada
  - [ ] Probar en el celular: reservar como juan.comprador con la app cerrada → llega "Reserva confirmada"
- [x] **3.5 CU05 asistente que guía por el sistema** (cliente y empleados; botón **"Ayuda"** flotante, en el celular sobre la barra inferior)
  - **Sin conexión primero:**
    - 33 preguntas frecuentes en español por rol (`mfe-shell/assistant/faq.json`), cada una con un botón que lleva a la pantalla correcta: "Ir a Mis reservas", "Ver pendientes", "Conectar Telegram"…;
    - el modelo **MiniLM** (`Xenova/all-MiniLM-L6-v2` cuantizado, unos 23 MB) corre **en el navegador** con transformers.js 3.8.1, se descarga la primera vez que se abre la ayuda y queda guardado;
    - los vectores de la FAQ vienen precalculados en int8 (97 KB, `tools/faq-embeddings`: `npm run build`).
  - **Puntaje híbrido**, 60 % semántico y 40 % palabras clave en español (`mfe-shell/assistant/matcher.js`, el mismo código en el navegador y en la evaluación). MiniLM está entrenado en inglés: solo, acierta 21 de 30; con el híbrido, 29 de 30.
  - **Evaluación** (`npm run eval`, 34 preguntas redactadas distinto a la FAQ, incluidas 4 fuera de tema):
    - 26 respondidas directo y bien, 3 con la correcta entre las sugerencias y 2 directas equivocadas ("contratamos un agente nuevo" → contratos; una pregunta de cifras → ficha);
    - las 3 preguntas fuera de tema (capital de Francia, una receta, un partido de fútbol) no se responden con la FAQ;
    - ojo: las preguntas de prueba las escribió quien armó la FAQ, así que las palabras clave salen favorecidas.
  - **Umbrales:**
    - 0,45 o más → responde directo;
    - entre 0,36 y 0,45 → "¿Te refieres a…?" con 3 opciones;
    - menos → "No encontré eso".
  - **Respaldo en línea solo si el usuario lo pide:** "Preguntar al asistente IA" → `POST /api/ai/assistant`.
    - Claude Haiku con esfuerzo bajo, máximo 300 tokens, y la guía de su rol como contexto.
    - Sin herramientas ni datos del negocio: para cifras manda a Reportes.
    - Límite de **10 preguntas por hora por usuario**.
  - **Probado en Chrome real** (sin ventana):
    - el modelo cargó en 5,8 s;
    - "quiero apartar un departamento" → reservar; "¿me devuelven la plata si cancelo?" → cancelar reserva; "capital de Francia" → "No encontré eso" + IA;
    - **sin red**, "cómo agendo una visita" respondió bien;
    - el agente recibe sus propias respuestas (estimar precio, autocompletar desde fotos);
    - el botón de acción cierra el panel y abre la sección.
  - Prueba real con Claude: respuesta correcta en 2,3 s, sin inventar funciones. API: sin sesión → 401; pregunta vacía → 400.
  - [ ] Probar en el navegador: botón "Ayuda" con distintos roles

> ⚠️ **Para tu amigo (despliegue, Fase 3):**
> - **Gateway:** carpetas nuevas `idempotency/` y `push/` (ya están en el `Dockerfile`) y la dependencia nueva `web-push` (`npm install`).
> - **Variables nuevas del gateway:** `IDEMPOTENCY_TABLE`, las mismas `AWS_*` reales de ms-billing, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (las mismas claves del `.env` local; si cambian, hay que volver a activar los avisos), y `KEYCLOAK_MONITOR_CLIENT_SECRET` (ahora también la usa el push).
> - **Shell:** archivos nuevos `sw.js`, `manifest.webmanifest`, `icons/`, `src/pwa/offline-queue.js` y `assistant/`. El Service Worker y los avisos **exigen HTTPS** (Vercel ya lo tiene).
> - **ms-contracts:** recompilar (tabla `push_subscriptions`).

## Refactors de arquitectura (al final, decisión del equipo)
Son internos a cada microservicio: no cambian rutas, JSON ni datos. Al terminar cada uno se repiten las pruebas por API para confirmar que nada se rompió.
- [x] **Red de seguridad** (`tests/api-snapshot.js`, solo lectura): una "foto" de **31 respuestas** de los 3 servicios, a través del gateway y del BFF GraphQL, con 5 roles. Incluye los errores esperados: 404, 400, 403 y la regla de reservar un inmueble no disponible (409).
  - Se tomó antes de refactorizar, se verificó que fuera estable y se comparó después de cada refactor: **31 de 31 idénticos** en los tres casos (rutas, estados HTTP, campos y mensajes).
- [x] **DDD en ms-properties** (`src/properties/domain/`)
  - **Agregado raíz `Property`** con las invariantes del ciclo de reserva: solo un inmueble DISPONIBLE se bloquea; liberar lo deja DISPONIBLE y sin titular.
  - **Value objects** `Money` y `GeoLocation`.
  - **Eventos de dominio:** `PropertyReservationLocked`, `PropertyReleased`, `PropertyReserved` y `PropertyStatusChanged`.
  - **Repositorio:** la interfaz vive en el dominio y la implementación Mongo en `infrastructure/`.
  - El servicio de aplicación carga el agregado, aplica la regla, guarda y publica los eventos. Las consultas siguen como lecturas directas (CQRS).
  - Pruebas del dominio (11 de 11): doble reserva rechazada, liberar, confirmar, eventos en orden, `Money` negativo y latitud 99 rechazados.
- [x] **Hexagonal en ms-contracts** (`contract/`)
  - **Dominio** `ContractRules`, sin imports de Spring ni JPA (verificado): reglas de firma, anulación, un contrato activo por inmueble, control notarial y hash SHA-256.
  - **Puertos de entrada:** 5 casos de uso.
  - **Puerto de salida:** `ContractRepositoryPort`.
  - **`ContractApplicationService`.**
  - **Adaptadores:** REST (`adapter/in/web`) y JPA (`adapter/out/persistence`).
  - Se quitaron el `ContractService` y el `ContractController` viejos.
  - Pruebas del dominio: 13 de 13.
- [x] **Clean en ms-billing**
  - **Entidades** `src/Domain/` (`BillingRules`, `RuleViolation`).
  - **Casos de uso** `src/Application/UseCase/`: `ChargeArras`, `RefundCharge`, `ManageReservations`, `RegisterOperationPayment` y `ManageCommissions`.
  - **Puerto** `BillingRepository`.
  - **Infraestructura** `DynamoBillingRepository`: traduce los errores de DynamoDB a `ConcurrentUpdate`.
  - **Controladores** como adaptadores de interfaz.
  - `DynamoStorageService` quedó sin cambios.
  - Pruebas de los casos de uso con un repositorio en memoria: 17 de 17 (idempotencia de arras, pasarela que rechaza, reembolso idempotente, cuota duplicada 409, comisión 3 % − 13 %, un agente solo ve las suyas).
- [x] **Visible en el modo demo** (`?demo=1`)
  - Botón **"Arquitectura"** en el encabezado: muestra, para el gateway y los 3 servicios, el patrón, las capas con sus carpetas, las invariantes del agregado y los **últimos eventos de dominio**. Cada servicio expone `GET /api/v1/architecture` y el gateway los junta en `GET /api/architecture`.
  - Las etiquetas demo de cada microfrontend dicen también la arquitectura ("… · DDD", "· Hexagonal", "· Clean Architecture").
- [x] **Prueba de pantallas en Chrome real** (solo lectura), sin errores de JavaScript:
  - cliente → catálogo (5), Mis reservas y Mis contratos (Angular → GraphQL);
  - Legal → 10 contratos;
  - admin en demo → panel con las 4 piezas y Caja con los totales.
- [x] **Prueba de flujos que escriben** (`node tests/flow-smoke.js`), corrida por el usuario el 05/11 con DEP-L81T: **17 de 17 OK**. La saga tardó 4,7 s; hubo replay con Idempotency-Key, doble reserva rechazada, contrato generado, firmado y anulado (con sus reglas de dominio), cancelación con reembolso y los eventos de dominio en orden. Recorre: reserva con saga → repetición con la misma Idempotency-Key → doble reserva rechazada → contrato generado, firmado y anulado → cancelación con reembolso. El inmueble queda DISPONIBLE y quedan registros de prueba anulados o reembolsados

## Recorrido completo en el navegador (06/11) y arreglos
- [x] **Recorrido de la guía con Chrome visible**, manejado por Claude y aprobado por el usuario, con datos reales. Pasos:
  - arquitectura en modo demo;
  - Juan: "Cerca de mí", consulta, visita y reserva de DEP-UJOB (saga en 4,4 s, Telegram);
  - Carlos: publica **DEP-7R9F** con fotos (TF.js) y precio sugerido (USD 164.500), responde la consulta y ve su agenda;
  - Elena: genera **CTR-BFBEEC0C** y da fe pública; Juan firma;
  - María: cobra el saldo (venta cerrada, comisión generada) y la liquida;
  - Juan: reserva y cancela DEP-L81T;
  - admin: segmentos, reporte con IA (9,5 s), monitor (26 s, Telegram) y dashboard con la misma sesión;
  - vista de celular: ayuda, sin conexión y cola enviada al reconectar.

  Estado final: DEP-UJOB vendido; DEP-L81T y DEP-7R9F disponibles.
- [x] **Pre-contrato de arras que quedaba "Pendiente de firma" tras la venta.**
  - Nuevo estado **CONCLUIDO**: al quedar FIRMADO el contrato definitivo de un inmueble, su pre-contrato de arras activo pasa a CONCLUIDO, con la nota "Concluido: se firmó el contrato definitivo CTR-…". Es una regla en el núcleo hexagonal (`ContractRules`, `ContractApplicationService.sign`).
  - CONCLUIDO cuenta como cerrado (no bloquea nuevas reservas) y no se puede anular.
  - `ContractSchemaMigration` (idempotente) amplió la restricción CHECK de `contracts.status` en Render para admitir CONCLUIDO, con aprobación del usuario. No cambió ninguna fila.
  - También se agregó en GraphQL (BFF), MCP y el ERP Angular, con la etiqueta "Concluido" y sin el botón "Anular".
  - Los pre-contratos que ya quedaron pendientes antes del arreglo (DEP-UJOB, DEP-VALLE-101) no se tocaron.
  - [x] Prueba de punta a punta corrida por el usuario (06/11) con DEP-7R9F: **21 de 21 OK**. Cuando el cliente firma, el contrato queda FIRMADO y **ARRAS-094786C3 pasa a CONCLUIDO** ("Concluido: se firmó el contrato definitivo CTR-26C92A4D"). Al cancelar la reserva, el pre-contrato sigue CONCLUIDO, el cobro queda REFUNDED y el inmueble DISPONIBLE
- [x] **Arreglos visuales** (solo CSS y texto; verificados en Chrome):
  - los modales tienen altura máxima y solo se desplaza su cuerpo: el pie con los botones queda siempre visible y **el mapa ya no lo tapa**;
  - la etiqueta de estado de la ficha tiene su estilo;
  - fechas y horas en 24 h (vencimiento de reservas, campanita, consultas);
  - en el celular, el buscador del catálogo ocupa todo el ancho y los filtros van en dos columnas iguales;
  - en el encabezado, con menos de 1500 px, los botones secundarios quedan solo con ícono y ningún texto se parte.
- [x] **Otros arreglos:**
  - los inmuebles **ALQUILADOS** se mostraban como "Vendido": ahora dicen "Alquilado", y el filtro de estado tiene "Alquilados";
  - `/api/health` marcaba ms-contracts "DOWN" porque contaba su 401 sin sesión como caída;
  - dos respuestas de la ayuda nombraban botones que no existen ("Reservar con arras", "Cancelar y reembolsar").
- [x] **Comisión antigua COM-97D511D1 corregida en DynamoDB**, con aprobación del usuario (06/11).
  - Se generó sin correo ni nombre del agente, y "Mis comisiones" filtra por correo, así que Carlos no la veía.
  - Solo se completaron `agentEmail` y `agentName`. La clave (`AGT-CARLOS-BROKER`, que ya era la de su cuenta), los montos, el estado y las fechas quedaron intactos.
  - El número de contrato se dejó vacío porque no se puede determinar con certeza.
  - Ahora Carlos ve 3 operaciones (USD 6.394,5 por cobrar y USD 6.525 cobrados), igual que el admin.

## Fase 4 — Cierre · 9–10 nov
- [ ] ICONIX de cada CU (descripción, robustez, secuencia) + modelo de dominio
- [ ] Diagramas de las 4 arquitecturas
- [ ] Restringir CORS + pruebas críticas
- [ ] Guion de demo
