# Despliegue después del último commit

Qué cambió para desplegar, qué variables nuevas hay en cada servicio y en qué orden hacerlo. Los valores secretos **no** van en este archivo: van en el panel de cada servicio (Railway / Render / Vercel) o en los `.env` locales.

> ⚠️ **Urgente:** la base de PostgreSQL de Render ya fue migrada al nuevo modelo de usuarios (SSO). El `ms-contracts` desplegado hoy **ya no funciona** con esa base. Hay que desplegar la versión nueva.

---

## 1. Resumen de cambios

| Servicio | Qué cambió | ¿Redesplegar? |
|---|---|---|
| **Keycloak** (nuevo) | Inicio de sesión único para todas las apps. Hoy solo corre local en Docker | **Sí, crear** |
| **BFF GraphQL** (nuevo) | `bff-graphql-gateway/`, lo usa el ERP Angular | **Sí, crear** |
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

---

## 6. API Gateway (`server.js`, Railway)

| Variable | Valor | ¿Nueva? |
|---|---|---|
| `PROPERTIES_SERVICE_URL` / `CONTRACTS_SERVICE_URL` / `BILLING_SERVICE_URL` | las de siempre | No |
| `KEYCLOAK_ISSUER_URI` | `https://<keycloak>/realms/habitat` | **Sí** |
| `BFF_URL` | `https://<bff>/` | **Sí** |
| `N8N_RESERVATION_WEBHOOK_URL` | `https://<n8n>/webhook/habitat-reserva-confirmada` | **Sí** (opcional) |
| `N8N_WEBHOOK_SECRET` | secreto largo; el mismo que la credencial de n8n | **Sí** (opcional) |

Sin las variables de n8n la reserva funciona igual; solo no se envía el aviso por Telegram.

> Se **eliminó** la ruta `POST /api/reservations/:id/buy`: la compra ahora se cierra cuando el Cajero cobra el saldo (`POST /api/payments`).

---

## 7. Vercel (frontends)

| Proyecto | Carpeta | Qué revisar |
|---|---|---|
| ERP Angular | `mfe-contracts-angular` | Ahora **compila**: *Build Command* `npm run build`, *Output Directory* `dist/browser` (ya está en `vercel.json`; que el panel no lo pise). Node 18 o más. El shell lo carga desde `/main.js` |
| Catálogo React | `mfe-properties-react` | Sin build; solo redesplegar |
| BI Next | `mfe-bi-next` | Variables: `NEXT_PUBLIC_KEYCLOAK_URL=https://<keycloak>`, `NEXT_PUBLIC_API_URL=https://<gateway>/api`, `NEXT_PUBLIC_SHELL_URL=https://<shell-vercel>` |
| Shell | `mfe-shell` | Sin build. Las llamadas `/api/*` ya se redirigen al gateway de Railway (`vercel.json`) |

> ⚠️ **Pendiente en el código antes de desplegar el shell:** el shell toma la URL de Keycloak de `window.HABITAT_KEYCLOAK_URL`, y la del dashboard de `window.HABITAT_BI_URL`. Si no están definidas usa `localhost`, así que en producción el login no funcionaría. Hay que agregar un bloque así al inicio de `mfe-shell/index.html`, con las URLs reales:
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
