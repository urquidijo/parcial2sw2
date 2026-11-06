# Despliegue después del último commit

Qué cambió para desplegar, qué variables nuevas hay en cada servicio y en qué orden hacerlo. Los valores secretos **no** van en este archivo: van en el panel de cada servicio (Railway / Render / Vercel) o en los `.env` locales.

> ⚠️ **Urgente:** la base de PostgreSQL de Render ya fue migrada al nuevo modelo de usuarios (SSO). El `ms-contracts` desplegado hoy **ya no funciona** con esa base. Hay que desplegar la versión nueva.

---

## 1. Resumen de cambios

| Servicio | Qué cambió | ¿Redesplegar? |
|---|---|---|
| **Keycloak** (nuevo) | Inicio de sesión único para todas las apps. Hoy solo corre local en Docker | **Sí, crear** |
| **BFF GraphQL** (nuevo) | `bff-graphql-gateway/`, lo usa el ERP Angular | **Sí, crear** |
| **Servidor MCP** (nuevo) | `mcp-habitat-server/`, herramientas de los reportes con IA (CU20) | **Sí, crear** |
| **ms-ml-python** (nuevo) | Machine Learning: precio (CU03) y segmentos de clientes (CU13) | **Sí, crear** |
| API Gateway (`server.js`) | Valida el token, permisos por rol, caja (CU16), comisiones (CU17/18), cancelación (CU15), aviso a n8n | Sí |
| ms-contracts (Spring) | SSO, empleados vía Keycloak, firmas, visitas, permisos por rol | Sí |
| ms-properties (NestJS) | SSO, editar inmueble, búsqueda por cercanía, consultas | Sí |
| ms-billing (PHP) | SSO, roles, cobros de saldo y cuotas, liquidar comisiones | Sí |
| ERP Angular (Vercel) | Rehecho en Angular 18 real (antes era JS suelto) | Sí |
| Catálogo React (Vercel) | Rediseño + ficha, mapa, consultas | Sí |
| BI Next (Vercel) | Caja / comisiones (`mfe-bi.js`) + dashboard con sesión única | Sí |
| Shell (Vercel) | Keycloak, rediseño, íconos Lucide | Sí |
| n8n | Flujo nuevo de Telegram (CU14) | Opcional |

**Bases de datos:** no hay que hacer nada a mano. Las tablas y los índices nuevos se crean solos al arrancar: `contract_signatures` en PostgreSQL, el índice geográfico y la colección `inquiries` en MongoDB. DynamoDB usa las 3 tablas que ya existen.

---

## 2. Orden recomendado

1. Keycloak → 2. microservicios → 3. BFF → 4. gateway → 5. Vercel → 6. URLs de producción en Keycloak → 7. n8n (opcional) → 8. pruebas.

El orden importa porque todos los servicios necesitan la URL pública de Keycloak, y el gateway necesita la del BFF.

---

## 2.1 Mapa multi-cloud (AWS + Google Cloud + Azure)

Cada microservicio corre en una nube distinta. Las variables de cada uno están en las secciones 3 a 7; aquí solo se explica dónde va cada uno y cómo se sube.

| Servicio | Dónde | Cómo se sube |
|---|---|---|
| ms-billing (PHP) | **AWS Elastic Beanstalk** (junto a DynamoDB) | zip de `ms-billing-php/` con su Dockerfile |
| ms-properties (NestJS) | **Google Cloud Run** | `gcloud run deploy --source .` |
| ms-contracts (Spring) | **Azure Container Apps** | `az containerapp up --source .` |
| Gateway, Keycloak, BFF, MCP, ML | Railway | el gateway **ya existe** (`api-gateway-production-c3ed`): solo se actualizan sus variables |
| Shell, React, Angular, BI | Vercel | los proyectos **ya existen**: no hay que crear otros, porque sus URLs están fijas en el código |

**Orden:** Keycloak → los 3 microservicios → BFF y ML → generar los dominios de Railway del MCP y del gateway (cada uno necesita la URL del otro) → gateway → Vercel → redirect URIs en Keycloak.

**Costos:** Railway no es gratis (crédito de prueba o Hobby de USD 5/mes). GCP pide tarjeta, pero el uso de la demo entra en el free tier. `az containerapp up` crea un registro de contenedores que consume del crédito (conviene usar Azure for Students). La PostgreSQL gratis de Render **vence a los 30 días**: revisar la fecha antes de la presentación.

### AWS — ms-billing (Elastic Beanstalk)
1. Comprimir **el contenido** de `ms-billing-php/` (`Dockerfile`, `public/`, `src/`; sin `.env`). No usar `Dockerrun.aws.json`: apunta a una imagen vieja de Docker Hub.
2. Elastic Beanstalk → *Create application* `habitat-billing` → plataforma **Docker** → subir el zip.
3. Preset **Single instance** (el load balancer no entra en el free tier).
4. Variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `KEYCLOAK_ISSUER_URI`.
5. La URL queda como `http://habitat-billing.<región>.elasticbeanstalk.com`. Sirve para el gateway (llamada de servidor a servidor): `BILLING_SERVICE_URL=http://.../api/v1`.

### Google Cloud — ms-properties (Cloud Run)
1. Activar las APIs Cloud Run, Cloud Build y Artifact Registry.
2. En MongoDB Atlas → *Network Access* permitir `0.0.0.0/0` (Cloud Run no tiene IP fija).
3. Copiar `ms-properties-nestjs/env.yaml.example` a `env.yaml` (no se versiona) y completar los datos.
4. Desde `ms-properties-nestjs/`:
   ```powershell
   gcloud run deploy ms-properties --source . --region us-central1 --allow-unauthenticated --port 3001 --env-vars-file env.yaml
   ```
5. Abrir la URL una vez antes de la demo, porque la primera petición después de escalar a cero tarda unos segundos.

### Azure — ms-contracts (Container Apps)
Desde `ms-contracts-spring/`:
```powershell
az login
az group create --name habitat-rg --location eastus
az containerapp up --name ms-contracts --resource-group habitat-rg --location eastus --source . --ingress external --target-port 8081
az containerapp secret set --name ms-contracts --resource-group habitat-rg --secrets "db-pass=<clave-render>" "kc-admin=<KEYCLOAK_ADMIN_CLIENT_SECRET>"
az containerapp update --name ms-contracts --resource-group habitat-rg --cpu 0.5 --memory 1Gi --set-env-vars `
  "SPRING_DATASOURCE_URL=jdbc:postgresql://<host-render>:5432/<base>?sslmode=require" `
  "SPRING_DATASOURCE_USERNAME=<usuario>" "SPRING_DATASOURCE_PASSWORD=secretref:db-pass" `
  "KEYCLOAK_ISSUER_URI=https://<keycloak>/realms/habitat" `
  "KEYCLOAK_JWKS_URI=https://<keycloak>/realms/habitat/protocol/openid-connect/certs" `
  "KEYCLOAK_URL=https://<keycloak>" "KEYCLOAK_ADMIN_CLIENT_SECRET=secretref:kc-admin"
```
El host de Render es el **externo** (`...oregon-postgres.render.com`).

### Railway
- **Keycloak:** Root Directory `keycloak` (usa `keycloak/Dockerfile`), volumen en `/opt/keycloak/data`, variables de la sección 3.
- **ML:** Root Directory `ms-ml-python` (Dockerfile). **BFF** y **MCP:** Root Directory propio, `npm start`.
- **Gateway:** el servicio que ya existe (Dockerfile de la raíz). Además de las variables de la sección 6, necesita `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `IDEMPOTENCY_TABLE` (la idempotencia usa DynamoDB) y `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`.

### URLs para anotar
```
[ ] Keycloak:     https://
[ ] ms-billing:   http://          .elasticbeanstalk.com
[ ] ms-properties https://ms-properties-     .run.app
[ ] ms-contracts: https://ms-contracts.     .azurecontainerapps.io
[ ] BFF / MCP / ML: https://        .up.railway.app
[ ] Gateway:      https://api-gateway-production-c3ed.up.railway.app (ya existe)
```
Con la URL de Keycloak, reemplazar `CAMBIAR-keycloak` en el bloque del inicio de `mfe-shell/index.html`.

---

## 3. Keycloak (servicio nuevo)

Sin Keycloak en la nube nadie puede iniciar sesión en producción.

- **Dónde:** Railway (u otro servicio con Docker y disco persistente).
- **Imagen:** `quay.io/keycloak/keycloak:24.0.2`.
- **Archivo del realm:** `keycloak/habitat-realm.json` tiene que estar dentro del contenedor, en `/opt/keycloak/data/import/`. La forma más simple es un `Dockerfile` en `keycloak/`:
  ```dockerfile
  FROM quay.io/keycloak/keycloak:24.0.2
  COPY habitat-realm.json /opt/keycloak/data/import/habitat-realm.json
  ENTRYPOINT ["/opt/keycloak/bin/kc.sh", "start-dev", "--import-realm"]
  ```
- **Volumen persistente** en `/opt/keycloak/data`. Sin él, cada redespliegue borra los usuarios creados.
- **Puerto:** 8080.

| Variable | Valor |
|---|---|
| `KEYCLOAK_ADMIN` | usuario de la consola, por ejemplo `admin` |
| `KEYCLOAK_ADMIN_PASSWORD` | contraseña nueva y fuerte (no la del docker-compose) |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | secreto nuevo y largo; **el mismo** que va en ms-contracts |
| `KC_PROXY_HEADERS` | `xforwarded` (necesario detrás del proxy HTTPS de Railway) |

Al terminar, anota la URL pública (ejemplo: `https://habitat-keycloak.up.railway.app`). De ahí salen:
- **Emisor de tokens:** `https://<keycloak>/realms/habitat`
- **Claves públicas (JWKS):** `https://<keycloak>/realms/habitat/protocol/openid-connect/certs`

> El emisor tiene que ser **exactamente** la URL pública, con `https` y sin `/` al final. Si no coincide, todos los servicios responden 401.

Usuarios demo que crea el realm (contraseña `pass123`, dominio `@habitat.pro`): `juan.comprador`, `carlos.broker`, `elena.ramos`, `maria.finanzas` y `admin`.

---

## 4. Microservicios

### ms-contracts (Spring Boot)
- Se construye con su `Dockerfile` (Maven + Java 21).

| Variable | Valor | ¿Nueva? |
|---|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<host-render>:5432/<base>` | **Sí** (antes estaba en el código) |
| `SPRING_DATASOURCE_USERNAME` | usuario de Render | **Sí** |
| `SPRING_DATASOURCE_PASSWORD` | contraseña de Render | **Sí** |
| `KEYCLOAK_ISSUER_URI` | `https://<keycloak>/realms/habitat` | **Sí** |
| `KEYCLOAK_JWKS_URI` | `https://<keycloak>/realms/habitat/protocol/openid-connect/certs` | **Sí** |
| `KEYCLOAK_URL` | `https://<keycloak>` (para crear y dar de baja empleados) | **Sí** |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | el mismo de Keycloak | **Sí** |

### ms-properties (NestJS)
| Variable | Valor | ¿Nueva? |
|---|---|---|
| `MONGO_URI` | cadena de MongoDB Atlas | **Sí** (antes estaba en el código) |
| `KEYCLOAK_ISSUER_URI` | `https://<keycloak>/realms/habitat` | **Sí** |

### ms-billing (PHP)
- Se construye con su `Dockerfile`. Hay archivos nuevos en `src/Http/` y `src/Services/`, y se copian solos.

| Variable | Valor | ¿Nueva? |
|---|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | los de siempre | No |
| `KEYCLOAK_ISSUER_URI` | `https://<keycloak>/realms/habitat` | **Sí** |

---

## 5. BFF GraphQL (servicio nuevo)

- **Dónde:** Railway, servicio Node con *Root Directory* = `bff-graphql-gateway`.
- **Arranque:** `npm install` y `npm start`.
- **Puerto:** el BFF lee `BFF_PORT`. Pon `BFF_PORT=4000` y configura el puerto 4000 en el servicio.

| Variable | Valor |
|---|---|
| `BFF_PORT` | `4000` |
| `BFF_CONTRACTS_URL` | `https://<ms-contracts>/api/v1` |
| `BFF_PROPERTIES_URL` | `https://<ms-properties>/api/v1/properties` |

### Servidor MCP de reportes (servicio nuevo)

- **Dónde:** Railway, servicio Node con *Root Directory* = `mcp-habitat-server`, arranque `npm install` y `npm start`.
- Las herramientas son de solo lectura y llaman al gateway con el token de quien pide el reporte.

| Variable | Valor |
|---|---|
| `MCP_PORT` | el puerto del servicio (ej. `4100`) |
| `MCP_HOST` | `0.0.0.0` (en local es `127.0.0.1`) |
| `HABITAT_API_URL` | `https://<gateway>/api` |

### ms-ml-python (servicio nuevo)

- **Dónde:** Railway, con el `Dockerfile` de `ms-ml-python/` (Python 3.11). Los modelos se entrenan al construir la imagen (~30 s).

| Variable | Valor |
|---|---|
| `KEYCLOAK_ISSUER_URI` | `https://<keycloak>/realms/habitat` |
| `PORT` | lo pone Railway (por defecto 8003) |

---

## 6. API Gateway (`server.js`, Railway)

| Variable | Valor | ¿Nueva? |
|---|---|---|
| `PROPERTIES_SERVICE_URL` / `CONTRACTS_SERVICE_URL` / `BILLING_SERVICE_URL` | las de siempre | No |
| `KEYCLOAK_ISSUER_URI` | `https://<keycloak>/realms/habitat` | **Sí** |
| `BFF_URL` | `https://<bff>/` | **Sí** |
| `CLAUDE_API_KEY` | clave de la API de Claude (reportes con IA, CU20) | **Sí** |
| `CLAUDE_MODEL` | `claude-haiku-5-5` (el más barato) | **Sí** |
| `MCP_URL` | `https://<servidor-mcp>/mcp` | **Sí** |
| `ML_SERVICE_URL` | `https://<ms-ml-python>` | **Sí** |
| `TELEGRAM_BOT_TOKEN` | token del bot (@habitatPro_bot): lo usa el gateway para que cada empleado vincule su Telegram | **Sí** |
| `KEYCLOAK_MONITOR_CLIENT_SECRET` | secreto de la cuenta de servicio `habitat-monitor` (agente monitor CU21); el mismo en Keycloak | **Sí** |
| `N8N_MONITOR_WEBHOOK_URL` | `https://<n8n>/webhook/habitat-monitor-alertas` | **Sí** (opcional) |

> **Keycloak en producción:** además de `KEYCLOAK_ADMIN_CLIENT_SECRET`, darle `KEYCLOAK_MONITOR_CLIENT_SECRET` al contenedor (el realm lo usa al importarse). Si Keycloak ya estaba creado, correr `node keycloak/add-monitor-client.js` apuntando a él (`KEYCLOAK_URL`, `KEYCLOAK_CONSOLE_USER`, `KEYCLOAK_CONSOLE_PASSWORD`).
> **n8n en producción:** variable `HABITAT_API_URL=https://<gateway>/api` e importar también `n8n/habitat_monitor_cu21.json` (ver `n8n/README.md`).
> **Base de datos:** ms-contracts crea solo la tabla `monitor_reports` y las columnas de Telegram en `users`.
| `N8N_RESERVATION_WEBHOOK_URL` | `https://<n8n>/webhook/habitat-reserva-confirmada` | **Sí** (opcional) |
| `N8N_WEBHOOK_SECRET` | secreto largo; el mismo que la credencial de n8n | **Sí** (opcional) |

Sin las variables de n8n la reserva funciona igual; solo no se envía el aviso por Telegram.

> Se **eliminó** la ruta `POST /api/reservations/:id/buy`: la compra ahora se cierra cuando el Cajero cobra el saldo (`POST /api/payments`).

---

## 7. Vercel (frontends)

| Proyecto | Carpeta | Qué revisar |
|---|---|---|
| ERP Angular | `mfe-contracts-angular` | Ahora **compila**: *Build Command* `npm run build`, *Output Directory* `dist/browser` (ya está en `vercel.json`; que el panel no lo pise). Node 18 o más. El shell lo carga desde `/main.js` |
| Catálogo React | `mfe-properties-react` | Sin build; solo redesplegar. Incluye la carpeta `models/` (modelo de IA de CU04, 4,8 MB): tiene que publicarse junto con `src/` |
| BI Next | `mfe-bi-next` | Variables: `NEXT_PUBLIC_KEYCLOAK_URL=https://<keycloak>`, `NEXT_PUBLIC_API_URL=https://<gateway>/api`, `NEXT_PUBLIC_SHELL_URL=https://<shell-vercel>` |
| Shell | `mfe-shell` | Sin build. Las llamadas `/api/*` ya se redirigen al gateway de Railway (`vercel.json`) |

> ✅ **Hecho:** el bloque ya está al inicio de `mfe-shell/index.html`, con `CAMBIAR-keycloak` como marcador: falta poner la URL real. Contexto: el shell toma la URL de Keycloak de `window.HABITAT_KEYCLOAK_URL`, y la del dashboard de `window.HABITAT_BI_URL`. Si no están definidas usa `localhost`, así que en producción el login no funcionaría. Hay que agregar un bloque así al inicio de `mfe-shell/index.html`, con las URLs reales:
> ```html
> <script>
>   if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
>     window.HABITAT_KEYCLOAK_URL = 'https://<keycloak>';
>     window.HABITAT_BI_URL = 'https://<bi-vercel>';
>   }
> </script>
> ```

---

## 8. Registrar las URLs de producción en Keycloak

En la consola de Keycloak: realm **habitat** → *Clients* → **habitat-web** → *Settings*.

- **Valid redirect URIs:** agregar `https://<shell-vercel>/*` y `https://<bi-vercel>/*`. Las de `localhost` se dejan, para seguir trabajando local.
- **Web origins:** `+` (ya está).
- **Guardar.**

El realm solo se importa la primera vez que arranca Keycloak. Cambios posteriores al JSON no se aplican solos: se hacen en la consola.

---

## 9. n8n y Telegram (opcional)

Solo si se quiere el aviso de reserva por Telegram en producción. Los pasos completos están en `n8n/README.md`.

| Variable en n8n | Valor |
|---|---|
| `TELEGRAM_CHAT_ID` | chat que recibe los avisos |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` |

1. Importar `n8n/habitat_reserva_telegram.json`.
2. Crear 2 credenciales:
   - **Telegram API**, con el token del bot (@habitatPro_bot; te lo paso por privado).
   - **Header Auth**, con nombre `X-Habitat-Secret` y valor `N8N_WEBHOOK_SECRET`.
3. Activar el flujo y poner la URL del webhook en el gateway.

---

## 10. Seguridad (una vez)

- Las contraseñas de **MongoDB Atlas** y **Render** estuvieron en el código y siguen en el historial de git. Conviene **cambiarlas** y cargar las nuevas en las variables de arriba.
- En producción usa un `KEYCLOAK_ADMIN_CLIENT_SECRET` y una contraseña de consola **nuevos**, no los de desarrollo.

---

## 11. Pruebas después de desplegar

- [ ] Entrar como `juan.comprador`: catálogo, ficha con mapa y "Cerca de mí"
- [ ] Ir del portal al dashboard sin volver a iniciar sesión (como `admin`)
- [ ] `juan` reserva un inmueble disponible → llega el aviso por Telegram (si n8n está activo) → cancela la reserva desde "Mis reservas"
- [ ] `elena.ramos` genera un contrato → lo firman `juan` y `elena` → queda **Firmado**
- [ ] `maria.finanzas` → "Caja": cobra el saldo → el inmueble queda vendido → liquida la comisión
- [ ] `carlos.broker` → "Mis comisiones": la ve pagada
- [ ] `admin` → "Empleados": crea uno y lo da de baja
- [ ] Sin sesión, `https://<gateway>/api/finances` responde **401**
- [ ] `?demo=1` en el shell muestra la tecnología de cada microfrontend (para la presentación)
