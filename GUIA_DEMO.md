# Guía de demo — Habitat Pro

Recorrido completo en el navegador, en el orden en que conviene mostrarlo. Cubre los 22 casos de uso, la app móvil (PWA), el modo sin conexión y las cuatro arquitecturas. Dura unos **30 minutos**; si hay menos tiempo, sigue el **recorrido corto** del final.

Cada bloque dice **qué hacer** (pasos) y **qué contar** (una o dos frases para el público).

---

## 1. Antes de empezar (15 minutos antes)

1. **Levantar todo:** en la raíz del proyecto, `.\start-all.ps1`. Espera a que abran todas las ventanas (gateway, 3 microservicios, ML, MCP, BI). Keycloak y n8n corren en Docker.
2. **Comprobar que todo responde:** abre `http://localhost:5000/api/health` y verifica que los tres microservicios digan `UP`.
3. **Abrir el portal en modo demo:** `http://localhost:5000/?demo=1` y luego **Ctrl+F5**.
4. **Preparar dos ventanas:**
   - una normal, para el cliente;
   - una de incógnito (Ctrl+Shift+N), para el personal.

   Así no hay que cerrar sesión a cada rato.
5. **Telegram abierto** en el celular o en la PC: ahí llegan la confirmación de reserva (CU14) y las alertas del monitor (CU21).
6. **Avisos push activados:** como `juan.comprador` → Mis reservas → "Activar avisos" → Permitir. Se hace una sola vez por navegador.
7. **Elegir los inmuebles de la demo.** En Inmuebles, anota dos que estén **Disponibles**:
   - **Inmueble A:** se reserva, se firma y se vende (bloques 3 a 6). Al final queda **vendido**.
   - **Inmueble B:** se reserva y se cancela con reembolso (bloque 7). Al final queda **disponible** otra vez.

   > El inmueble A queda vendido y con su contrato firmado: no se puede volver a reservar. Para ensayar, usa uno distinto del que mostrarás al docente.

### Cuentas (contraseña `pass123`, dominio `@habitat.pro`)

| Usuario | Rol | Qué muestra |
|---|---|---|
| `juan.comprador` | Cliente | Catálogo, visitas, reserva, firma, app móvil, ayuda |
| `carlos.broker` | Agente | Publicar con IA, precio sugerido, consultas, agenda, comisiones |
| `elena.ramos` | Oficial legal | Generar y dar fe de contratos |
| `maria.finanzas` | Cajero | Cobros, comisiones, dashboard |
| `admin` | Administrador | Empleados, segmentos, reportes con IA, monitor, dashboard |

---

## 2. Arquitectura en 2 minutos (cualquier usuario, modo demo)

**Hacer:**
1. Inicia sesión con cualquier usuario en `?demo=1`.
2. Señala las **etiquetas grises** sobre cada sección: dicen qué microfrontend es, con qué tecnología y a qué microservicio habla. Por ejemplo: *"React 18 · REST → ms-properties (NestJS + MongoDB Atlas) · DDD"*.
3. Pulsa **"Arquitectura"** en el encabezado.

**Contar:**
- "Son tres microservicios, cada uno con su propia base de datos en la nube: MongoDB Atlas, PostgreSQL en Render y DynamoDB en AWS. Cada uno con un estilo de arquitectura distinto."
- **ms-properties es DDD.** El *agregado* `Property` concentra las reglas: solo un inmueble disponible se puede reservar. Cada cambio publica un *evento de dominio*.
- **ms-contracts es Hexagonal.** Las reglas de firma y anulación no dependen de Spring ni de la base de datos. El controlador REST y el acceso a PostgreSQL son *adaptadores* intercambiables.
- **ms-billing es Clean Architecture.** Cada operación (cobrar arras, reembolsar, registrar cuota, pagar comisión) es un *caso de uso*. DynamoDB queda en la capa externa.
- **El gateway** orquesta la *saga* de reserva entre las tres bases, junta las lecturas en un *modelo de lectura* (CQRS) y evita duplicados con *Idempotency-Key*.
- "Los tres refactors se verificaron con 31 respuestas del API que quedaron idénticas antes y después, más una prueba de flujos de punta a punta."

---

## 3. Cliente: buscar, consultar, visitar y reservar (`juan.comprador`)

**3.1 Inicio de sesión único — CU07**
- **Hacer:** "Iniciar sesión" → pantalla de Keycloak → `juan.comprador`.
- **Contar:** "Una sola cuenta para el portal, el ERP, el dashboard y la app móvil (SSO con Keycloak). Cada microservicio valida el mismo token y aplica los permisos de su rol."

**3.2 Catálogo — CU01**
- **Hacer:**
  1. En Inmuebles, filtra por ciudad o tipo.
  2. Abre el mapa y prueba **"Cerca de mí"** (el navegador pide permiso de ubicación).
  3. Abre un inmueble con **"Ver ficha"**: fotos, superficie, ambientes, ubicación y, si lo tiene, "Ver recorrido 3D".
- **Contar:** "La búsqueda por cercanía usa un índice geoespacial de MongoDB."

**3.3 Consultar al asesor — CU01**
- **Hacer:** en la ficha, **"Consultar al asesor"** → escribe una pregunta → enviar. La respuesta aparecerá en "Mis consultas" (el agente responde en el bloque 4).

**3.4 Agendar visita — CU09**
- **Hacer:** en la ficha del inmueble A, **"Agendar visita"** → fecha, hora y modalidad → "Agendar visita".

**3.5 Reservar con arras — CU14 (la saga)**
- **Hacer:** en la ficha del inmueble A, **"Reservar con arras"** → revisa el monto → "Confirmar reserva".
- **Mostrar:**
  - el aviso "Reserva … confirmada";
  - el mensaje de **Telegram** que llega por n8n;
  - la **notificación push** en la PC o el celular (CU06).
- **Contar:**
  - "Es una transacción distribuida en tres bases. El gateway bloquea el inmueble en MongoDB, cobra las arras en DynamoDB y genera el pre-contrato en PostgreSQL."
  - "Si cualquier paso falla, compensa: reembolsa y libera el inmueble. Así nunca queda una reserva a medias."
  - "Si el celular reintenta por mala señal, la Idempotency-Key hace que no se cobre dos veces."

**3.6 Mis reservas**
- **Hacer:** abre **"Mis reservas"**: la reserva está ACTIVA, con las arras y el vencimiento a 48 h.

---

## 4. Agente: publicar con IA, precio sugerido y agenda (`carlos.broker`, ventana de incógnito)

**4.1 Publicar con fotos — CU02 y CU04**
- **Hacer:**
  1. Inmuebles → **"Publicar inmueble"**.
  2. **"Autocompletar desde fotos"** → elige fotos de un dormitorio, un baño y una cocina.
  3. Muestra los recuadros detectados ("cama 95 %", "inodoro 90 %") y las sugerencias (dormitorios, baños, comodidades). Confirma con las casillas.
- **Contar:** "Es deep learning en el navegador: TensorFlow.js con COCO-SSD, cuantizado a 4,8 MB. Las fotos no salen del dispositivo y no cuesta nada."

**4.2 Precio sugerido — CU03**
- **Hacer:** elige ciudad y zona en las listas, completa la superficie y los ambientes → **"Estimar precio"** → precio sugerido y rango probable → **"Usar este precio"**.
- **Contar:** "Es un modelo supervisado, random forest, con R² = 0,89. Los notebooks con las métricas están en `ms-ml-python/notebooks/`."

**4.3 Responder consultas — CU01**
- **Hacer:** Inmuebles → **"Consultas de clientes"** → responde la consulta de Juan con **"Responder"**.
- **Mostrar:** en la ventana de Juan aparece en "Mis consultas".

**4.4 Agenda de visitas — CU10**
- **Hacer:** Visitas → la visita de Juan → confirmarla.

**4.5 Mis comisiones — CU18**
- **Hacer:** abre **"Mis comisiones"**. La de esta venta aparecerá después del cobro del bloque 6.

---

## 5. Legal: contrato y fe pública (`elena.ramos`)

**5.1 Generar contrato — CU11**
- **Hacer:** Contratos → **"Generar contrato"** → cliente Juan, inmueble A, tipo **Compraventa** → "Generar".
- **Mostrar:** también está el **pre-contrato de arras** que creó la saga.

**5.2 Dar fe pública — CU12**
- **Hacer:** en el contrato nuevo, **"Dar fe pública"**. Sigue *Pendiente de firma* hasta que firme el cliente.
- **Contar:** "La firma guarda un hash SHA-256 del documento, la fecha y el firmante. Las reglas (no firmar dos veces, no firmar uno anulado) viven en el núcleo hexagonal, sin framework."

**5.3 Firma del cliente — CU12** (vuelve a la ventana de Juan)
- **Hacer:** Mis contratos → abre el contrato → **"Firmar"**. Pasa a **Firmado**.

---

## 6. Cajero: cobro, comisión y dashboard (`maria.finanzas`)

**6.1 Cobrar el saldo — CU16**
- **Hacer:** **Caja** → pestaña **"Cobros"** → la operación del inmueble A → **"Cobrar saldo"** → método de pago → confirmar.
- **Mostrar:** el inmueble pasa a **Vendido**, la reserva a **Compra cerrada** y se genera la **comisión del agente**.
- **Contar:** "El gateway valida contra el contrato firmado (tipo, titular y monto). El mismo saldo no se puede registrar dos veces."

**6.2 Liquidar la comisión — CU17**
- **Hacer:** pestaña **"Comisiones"** → **"Liquidar"** con una referencia.
- **Mostrar:** en la ventana de Carlos, **"Mis comisiones"** la muestra pagada (CU18).
- **Contar:** "La comisión es el 3 % de la operación, menos el 13 % de retención."

**6.3 Libro mayor**
- **Hacer:** pestaña **"Libro mayor"**: arras, saldos y cuotas, con su estado.

---

## 7. Cliente: cancelar con reembolso — CU15 (`juan.comprador`)

**Hacer:**
1. Reserva el **inmueble B** ("Reservar con arras").
2. En **"Mis reservas"** pulsa **"Cancelar y reembolsar"**.

**Mostrar:**
- la reserva queda *Cancelada · reembolsada*;
- el inmueble B vuelve a **Disponible** en el catálogo;
- llega el **aviso push** "Reserva cancelada".

**Contar:** "Es otra operación entre las tres bases: reembolso en DynamoDB, pre-contrato anulado en PostgreSQL e inmueble liberado en MongoDB."

---

## 8. Administrador: personal, IA y monitor (`admin`)

**8.1 Empleados — CU08**
- **Hacer:** Empleados → **"Nuevo empleado"** (nombre, correo, sector). Muestra también:
  - "Dar de baja" y "Reactivar";
  - la columna **Telegram** y la casilla **"Recibe alertas"**.
- **Contar:** "Se crea también en Keycloak, con su rol y sector."

**8.2 Segmentos de clientes — CU13**
- **Hacer:** abre **"Segmentos"**: cada cliente tiene un perfil (Inversionista, Primera vivienda, Inquilino, Curioso) y se ven los gráficos del codo y del PCA.
- **Contar:** "Es aprendizaje no supervisado: K-means con k = 4 elegido por el método del codo, y un ARI de 0,93 contra los perfiles reales."

**8.3 Reporte por voz — CU20**
- **Hacer:**
  1. Abre **Reportes** → pulsa el micrófono y di *"inmuebles disponibles en Santa Cruz con su precio"*, o usa un ejemplo.
  2. Muestra el resumen y la tabla → **"Exportar Excel"**.
  3. En modo demo, señala la etiqueta con el modelo y los tokens usados.
- **Contar:**
  - "Claude no escribe SQL: elige entre herramientas fijas de solo lectura de un servidor MCP. La tabla sale de los datos reales, así no puede inventar filas."
  - "Usa el token del usuario, así cada rol ve solo lo que le corresponde."

**8.4 Monitor del negocio — CU21**
- **Hacer:** abre la **campanita** → **"Revisar ahora"** → alertas priorizadas (alta abierta; media y baja desplegables).
- **Mostrar:** el resumen que llega por **Telegram** a los empleados con "Recibe alertas" activado.
- **Contar:** "Además corre solo cada mañana a las 08:00 (n8n con una cuenta de servicio de Keycloak)."

**8.5 Dashboard — CU19**
- **Hacer:** **Dashboard** (se abre en otra pestaña con la misma sesión) → pestaña **"Resumen"**:
  - ingresos del mes (ya incluye la venta de recién);
  - barras por mes con detalle al pasar el mouse y "Ver como tabla";
  - embudo visitas → reservas → contratos;
  - cartera, agentes y "Requiere atención".
- **Contar:** "Es el lado de lectura de CQRS: un solo resumen que cruza las tres bases."

---

## 9. App móvil y sin conexión — PWA, CU22, CU06 y CU05 (`juan.comprador`)

**9.1 Instalar la app**
- **Hacer:** pulsa **"Instalar app"** en el encabezado: se abre como aplicación, con ícono propio.
- **Mostrar:** con la ventana angosta, o en el celular, la navegación pasa a una barra inferior.

**9.2 Sin conexión — CU22**
- **Hacer:**
  1. F12 → pestaña **Network** → marca **Offline** → recarga la página.
  2. La app abre igual, con el aviso *"Sin conexión. Estás viendo el catálogo guardado el …"*.
  3. Agenda una visita: queda en **"Pendientes (1)"**.
  4. Intenta reservar: avisa que necesita conexión.
  5. Desmarca Offline → **"Reconectar"**. Lo pendiente se envía solo.
- **Contar:** "Lo que no mueve dinero se guarda en el dispositivo y se envía al volver la señal, con la misma Idempotency-Key, para que no se duplique."

**9.3 Avisos — CU06**
- **Hacer:** Mis reservas → **"Probar aviso"**.
- **Contar:** "Los avisos llegan aunque la app esté cerrada. En Android funcionan siempre; en iPhone, con la app instalada."

**9.4 Ayuda — CU05**
- **Hacer:**
  1. Pulsa **"Ayuda"** (abajo a la derecha).
  2. Pregunta *"¿cómo aparto un departamento?"*: responde y ofrece el botón "Ir a Inmuebles".
  3. Repite con la red en Offline: sigue respondiendo.
  4. Para una pregunta que no está en la ayuda, ofrece **"Preguntar al asistente IA"**.
- **Contar:** "Un modelo pequeño (MiniLM) corre en el navegador y busca entre las preguntas frecuentes de cada rol. Solo si no encuentra la respuesta, y el usuario lo pide, consulta a Claude."

---

## 10. Recorrido corto (10 minutos)

1. **Arquitectura** (bloque 2): el botón "Arquitectura" y las etiquetas.
2. **Juan reserva** el inmueble A (3.5): saga, Telegram y aviso push.
3. **Carlos** usa "Autocompletar desde fotos" y "Estimar precio" (4.1 y 4.2).
4. **Admin:** reporte por voz con Excel (8.3) y campanita → "Revisar ahora" (8.4).
5. **Dashboard → Resumen** (8.5).
6. **Juan sin conexión** (9.2) y **Ayuda** (9.4).
7. **Juan cancela y recibe el reembolso** (bloque 7).

---

## 11. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| Pantalla de login con "No se pudo conectar con el servidor de inicio de sesión" | Keycloak no está arriba: `docker compose up -d keycloak-sso` y espera ~30 s. |
| Una sección vacía o con error de servicio | Revisa `http://localhost:5000/api/health` y reinicia la ventana del servicio caído (o `.\start-all.ps1`). |
| No ves los cambios recientes | Ctrl+F5. Si quedó una versión vieja de la app, aparece "Hay una versión nueva → Actualizar". |
| No llega el mensaje de Telegram | n8n (http://localhost:5678) tiene que estar arriba con los flujos activos. La reserva igual se completa: el aviso no la frena. |
| No llega el aviso push | Mis reservas → "Probar aviso". Si dice que no hay dispositivos, pulsa "Activar avisos" otra vez. |
| La reserva falla con "no puede ser reservada" | Ese inmueble ya no está disponible: elige otro (es la regla de dominio funcionando). |
| Reportes, monitor o asistente IA dan error de la API de Claude | Revisa el crédito de la cuenta de Anthropic. Cada reporte cuesta ~USD 0,001 y cada revisión del monitor ~USD 0,002. |

**Para comprobar todo antes de la presentación** (desde la raíz):
- `node tests/api-snapshot.js save foto.json` y luego `check foto.json`: compara 31 respuestas del API. **Solo lectura.**
- `node tests/flow-smoke.js`: recorre la saga, la idempotencia, los contratos y la cancelación. Deja registros de prueba anulados y el inmueble disponible.
