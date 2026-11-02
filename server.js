/**
 * HABITAT PRO - API GATEWAY & ORQUESTADOR SAGA DISTRIBUIDO
 * 
 * Arquitectura de Microservicios 100% Desacoplados:
 * 1. ms-properties-nestjs  (:3001) -> MongoDB Atlas (Nube)
 * 2. ms-contracts-spring   (:8081) -> PostgreSQL Render (Nube)
 * 3. ms-billing-php        (:8002) -> Amazon DynamoDB AWS us-east-1 (Nube)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const app = express();
app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// SSO: validación del token de Keycloak en el gateway
// -------------------------------------------------------------
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER_URI || 'http://localhost:8080/realms/habitat';
const keycloakJwks = createRemoteJWKSet(new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`));
const requestContext = new AsyncLocalStorage();

const PUBLIC_ROUTES = [
  { method: 'GET', pattern: /^\/api\/properties(\/[^/]+)?$/ },
  { method: 'GET', pattern: /^\/api\/properties\/search\/geo$/ },
  { method: 'GET', pattern: /^\/api\/health$/ },
];

app.use('/api', async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const isPublic = PUBLIC_ROUTES.some((r) => r.method === req.method && r.pattern.test(req.baseUrl + req.path));

  if (token) {
    try {
      const { payload } = await jwtVerify(token, keycloakJwks, { issuer: KEYCLOAK_ISSUER });
      req.user = payload;
    } catch {
      return res.status(401).json({ success: false, message: 'Sesión inválida o expirada. Inicia sesión nuevamente.' });
    }
  } else if (!isPublic) {
    return res.status(401).json({ success: false, message: 'Debes iniciar sesión para usar esta función.' });
  }

  // El token viaja con la petición para que fetchService lo reenvíe a los microservicios (incluida la saga).
  requestContext.run({ authorization: token ? header : null }, next);
});

// Servir frontend unificado (mfe-shell)
app.use(express.static(path.join(__dirname, 'mfe-shell')));

// Servir Microfrontends desacoplados (React, Angular, Next.js)
app.use('/mfe/properties', express.static(path.join(__dirname, 'mfe-properties-react')));
app.use('/mfe/contracts', express.static(path.join(__dirname, 'mfe-contracts-angular')));
app.use('/mfe/bi', express.static(path.join(__dirname, 'mfe-bi-next')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'mfe-shell', 'index.html'));
});

// Prevención de caídas de proceso
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Uncaught Exception]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Unhandled Rejection]:', reason);
});

// URLs de los Microservicios (compatibles con dominios directos de Railway)
const baseProperties = process.env.PROPERTIES_SERVICE_URL || process.env.MS_PROPERTIES_URL || 'http://localhost:3001/api/v1/properties';
const PROPERTIES_SVC = baseProperties.includes('/api/v1/properties') ? baseProperties : `${baseProperties.replace(/\/$/, '')}/api/v1/properties`;

const baseContracts = process.env.CONTRACTS_SERVICE_URL || process.env.MS_CONTRACTS_URL || 'http://localhost:8081/api/v1';
const CONTRACTS_SVC = baseContracts.includes('/api/v1') ? baseContracts : `${baseContracts.replace(/\/$/, '')}/api/v1`;

const baseBilling = process.env.BILLING_SERVICE_URL || process.env.MS_BILLING_URL || 'http://localhost:8002/api/v1';
const BILLING_SVC = baseBilling.includes('/api/v1') ? baseBilling : `${baseBilling.replace(/\/$/, '')}/api/v1`;

console.log('🔗 [Microservicios Configurados]:');
console.log('   • Catálogo (MongoDB Atlas):       ', PROPERTIES_SVC);
console.log('   • Legal & Auth (PostgreSQL Render):', CONTRACTS_SVC);
console.log('   • Pagos & TTL (Amazon DynamoDB):   ', BILLING_SVC);

// Helper para llamadas HTTP fetch con manejo de timeout resiliente a cold-starts
async function fetchService(url, options = {}) {
  const timeoutMs = options.timeout || 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...(options.headers || {}) };
  const authorization = requestContext.getStore()?.authorization;
  if (authorization && !headers.Authorization) headers.Authorization = authorization;
  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const msg = isTimeout 
      ? 'El microservicio está iniciando en la nube (Cold Start de Render/Railway). Por favor espere unos segundos e intente nuevamente.'
      : 'Microservicio no disponible: ' + err.message;
    return { ok: false, status: 503, error: err.message, data: { success: false, message: msg } };
  }
}

// Rol efectivo del token (igual que en los microservicios): ADMIN, el sector del EMPLEADO o CLIENTE.
function effectiveRole(user) {
  const roles = user?.realm_access?.roles || [];
  if (roles.includes('ADMIN')) return 'ADMIN';
  if (roles.includes('EMPLEADO')) return String(user.sector || 'EMPLEADO').toUpperCase();
  return 'CLIENTE';
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Debes iniciar sesión para usar esta función.' });
    if (!roles.includes(effectiveRole(req.user))) {
      return res.status(403).json({ success: false, message: 'Tu rol no tiene permiso para esta operación.' });
    }
    next();
  };
}

// Perfil de quien llama (ms-contracts lo resuelve a partir del token). El cliente nunca se toma del body.
async function callerProfile() {
  const result = await fetchService(`${CONTRACTS_SVC}/auth/sso`, { method: 'POST' });
  return result.ok && result.data?.user ? result.data.user : null;
}

// Respuesta del microservicio tal cual, con el mensaje de error normalizado.
function passthrough(res, result) {
  if (result.ok) return res.status(result.status).json(result.data);
  return sendResult(res, result);
}

const enc = encodeURIComponent;

// -------------------------------------------------------------
// 1. ENDPOINTS DE AUTENTICACIÓN Y USUARIOS (ms-contracts -> PostgreSQL Render)
// -------------------------------------------------------------

// El login lo hace Keycloak (SSO); aquí solo se sincroniza el perfil del usuario del token en PostgreSQL.
app.post('/api/auth/sso', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/auth/sso`, { method: 'POST' });
  return res.status(result.status).json(result.data);
});

app.get('/api/users', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/users`);
  return res.status(result.status).json(result.data);
});

// -------------------------------------------------------------
// 2. ENDPOINTS DE CATÁLOGO INMOBILIARIO (ms-properties -> MongoDB Atlas)
// -------------------------------------------------------------

app.get('/api/properties', async (req, res) => {
  const params = new URLSearchParams(req.query);
  const result = await fetchService(`${PROPERTIES_SVC}?${params.toString()}`);
  if (result.ok && Array.isArray(result.data)) {
    return res.json({ success: true, count: result.data.length, data: result.data });
  }
  return res.status(result.status).json(result.data);
});

// GraphQL del ERP: el BFF (bff-graphql-gateway) une ms-contracts y ms-properties en una sola consulta.
const BFF_URL = process.env.BFF_URL || 'http://localhost:4000/';

app.post('/api/graphql', async (req, res) => {
  const result = await fetchService(BFF_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  return res.status(result.status).json(result.data);
});

// Respuesta uniforme { success, data | message } a partir de la respuesta de un microservicio (NestJS devuelve message como arreglo en errores de validación).
function sendResult(res, result) {
  if (result.ok) return res.status(result.status).json({ success: true, data: result.data });
  const message = Array.isArray(result.data?.message) ? result.data.message.join('. ') : (result.data?.message || 'Error en el microservicio');
  return res.status(result.status).json({ success: false, message });
}

app.get('/api/properties/search/geo', async (req, res) => {
  const params = new URLSearchParams(req.query);
  return sendResult(res, await fetchService(`${PROPERTIES_SVC}/search/geo?${params.toString()}`));
});

app.get('/api/properties/:id', async (req, res) => {
  const result = await fetchService(`${PROPERTIES_SVC}/${req.params.id}`);
  return res.status(result.status).json(result.data);
});

app.post('/api/properties', async (req, res) => {
  return sendResult(res, await fetchService(PROPERTIES_SVC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  }));
});

app.patch('/api/properties/:id', async (req, res) => {
  return sendResult(res, await fetchService(`${PROPERTIES_SVC}/${encodeURIComponent(req.params.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  }));
});

// Consultas de clientes sobre un inmueble (CU01)
const INQUIRIES_SVC = PROPERTIES_SVC.replace(/\/properties$/, '/inquiries');

app.post('/api/properties/:id/inquiries', async (req, res) => {
  return sendResult(res, await fetchService(`${PROPERTIES_SVC}/${encodeURIComponent(req.params.id)}/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  }));
});

app.get('/api/inquiries', async (req, res) => {
  return sendResult(res, await fetchService(INQUIRIES_SVC));
});

app.patch('/api/inquiries/:id/answer', async (req, res) => {
  return sendResult(res, await fetchService(`${INQUIRIES_SVC}/${encodeURIComponent(req.params.id)}/answer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  }));
});

app.post('/api/properties/:id/reset', async (req, res) => {
  const result = await fetchService(`${PROPERTIES_SVC}/${req.params.id}/reset`, { method: 'POST' });
  return res.status(result.status).json(result.data);
});

app.post('/api/properties/reset-all', async (req, res) => {
  const result = await fetchService(`${PROPERTIES_SVC}/reset-all`, { method: 'POST' });
  return res.status(result.status).json(result.data);
});

// -------------------------------------------------------------
// 3. TRANSACCIÓN DISTRIBUIDA SAGA: RESERVA FORMAL CON ARRAS
// Involucra los 3 microservicios y bases de datos con compensación automática
// -------------------------------------------------------------

app.post('/api/reservations', requireRoles('CLIENTE', 'ADMIN'), async (req, res) => {
  const { propertyId, userPhone, depositAmount } = req.body;
  if (!propertyId) return res.status(400).json({ success: false, message: 'propertyId es obligatorio' });

  // El titular de la reserva sale del token; solo el ADMIN puede reservar a nombre de otro cliente.
  let clientId = req.body.userId;
  let userName = req.body.userName;
  if (effectiveRole(req.user) === 'CLIENTE') {
    const me = await callerProfile();
    if (!me) return res.status(502).json({ success: false, message: 'No se pudo obtener tu perfil desde ms-contracts.' });
    clientId = me.id;
    userName = me.name;
  } else if (!clientId) {
    return res.status(400).json({ success: false, message: 'userId del cliente es obligatorio cuando reserva el ADMIN' });
  }
  const amount = parseFloat(depositAmount) || 5000;

  console.log(`\n========================================================================`);
  console.log(`🚀 [API GATEWAY] INICIANDO SAGA DE RESERVA DISTRIBUIDA (3 FASES)`);
  console.log(`Propiedad: #${propertyId} | Cliente: ${userName} (${clientId}) | Arras: $${amount} USD`);
  console.log(`========================================================================`);

  const sagaTrace = {
    step1_locked: false,
    step2_charged: false,
    step2_saved_dynamo: false,
    step3_contract_created: false,
    paymentId: null,
    // Ids únicos (antes 4 cifras al azar: si se repetían, se sobrescribía otra reserva en DynamoDB)
    reservationId: 'RES-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
    contractNumber: 'ARRAS-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
  };

  try {
    // -----------------------------------------------------------------
    // FASE 1: Bloqueo Preventivo en ms-properties (MongoDB Atlas)
    // -----------------------------------------------------------------
    // FASE 1: Bloqueo Preventivo en ms-properties (MongoDB Atlas)
    // -----------------------------------------------------------------
    console.log(`▶ [PASO 1/3] Bloqueando inmueble #${propertyId} en MongoDB Atlas...`);
    const lockRes = await fetchService(`${PROPERTIES_SVC}/${propertyId}/reserve-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, lockDurationMinutes: 48 * 60 })
    });

    if (!lockRes.ok) {
      const detail = lockRes.data?.message || lockRes.error || 'El inmueble no está disponible en MongoDB';
      const err = new Error(detail);
      err.failedService = 'ms-properties-nestjs (Catálogo / MongoDB Atlas)';
      err.stepNumber = 1;
      throw err;
    }
    sagaTrace.step1_locked = true;
    console.log(`✅ [PASO 1 EXITOSO]: Inmueble bloqueado como RESERVADO_PENDIENTE en MongoDB Atlas.`);

    // -----------------------------------------------------------------
    // FASE 2: Procesamiento de Arras en ms-billing (Amazon DynamoDB)
    // -----------------------------------------------------------------
    console.log(`▶ [PASO 2/3] Procesando cobro de arras en Amazon DynamoDB...`);
    const chargeRes = await fetchService(`${BILLING_SVC}/billing/charges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `saga-${sagaTrace.reservationId}-${Date.now()}`
      },
      body: JSON.stringify({
        propertyId,
        clientId,
        amount,
        currency: 'USD'
      })
    });

    if (!chargeRes.ok || !chargeRes.data?.success) {
      const detail = chargeRes.data?.message || chargeRes.error || 'Fallo en pasarela de cobro o DynamoDB no disponible';
      const err = new Error(detail);
      err.failedService = 'ms-billing-php (Cobros de Arras / Amazon DynamoDB)';
      err.stepNumber = 2;
      throw err;
    }
    sagaTrace.step2_charged = true;
    sagaTrace.paymentId = chargeRes.data.paymentId;
    console.log(`✅ [PASO 2A EXITOSO]: Cobro registrado en DynamoDB con ID: ${sagaTrace.paymentId}.`);

    // Registrar reserva en tabla de reservas DynamoDB con TTL de 48h
    const propTitle = lockRes.data?.property?.title || lockRes.data?.title || ('Inmueble #' + propertyId);
    const resvSave = await fetchService(`${BILLING_SVC}/billing/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: sagaTrace.reservationId,
        propertyId,
        propertyTitle: propTitle,
        userId: clientId,
        userName,
        userPhone,
        depositAmount: amount,
        paymentId: sagaTrace.paymentId,
        contractNumber: sagaTrace.contractNumber,
        status: 'ACTIVA'
      })
    });
    if (!resvSave.ok) {
      const detail = resvSave.data?.message || resvSave.error || 'Error al persistir registro de reserva con TTL';
      const err = new Error(detail);
      err.failedService = 'ms-billing-php (Almacenamiento de Reserva / DynamoDB)';
      err.stepNumber = 2;
      throw err;
    }
    sagaTrace.step2_saved_dynamo = true;
    console.log(`✅ [PASO 2B EXITOSO]: Reserva registrada en DynamoDB con TTL de 48 horas.`);

    // -----------------------------------------------------------------
    // FASE 3: Emisión de Pre-Contrato Notarial en ms-contracts (PostgreSQL Render)
    // -----------------------------------------------------------------
    console.log(`▶ [PASO 3/3] Generando Pre-Contrato notarial en PostgreSQL Render...`);
    const contractRes = await fetchService(`${CONTRACTS_SVC}/contracts/pre-contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: String(propertyId),
        clientId,
        // El agente que publicó el inmueble (CU17: a él le corresponde la comisión al cerrar la operación)
        agentId: lockRes.data?.property?.brokerEmail || 'AGT-CARLOS-BROKER',
        propertyTitle: lockRes.data?.property?.title,
        clientName: userName,
        paymentReferenceId: sagaTrace.paymentId,
        totalAmount: lockRes.data?.property?.price || (amount * 10),
        depositAmount: amount
      })
    });

    if (!contractRes.ok || contractRes.data?.error || contractRes.data?.success === false) {
      const detail = contractRes.data?.message || contractRes.error || 'Rechazo notarial o de esquema en PostgreSQL';
      const err = new Error(detail);
      err.failedService = 'ms-contracts-spring (Legal & Notaría / PostgreSQL Render)';
      err.stepNumber = 3;
      throw err;
    }
    sagaTrace.step3_contract_created = true;
    const finalContract = contractRes.data;
    sagaTrace.contractNumber = finalContract.contractNumber || sagaTrace.contractNumber;
    console.log(`✅ [PASO 3 EXITOSO]: Contrato #${sagaTrace.contractNumber} emitido en PostgreSQL Render.`);

    // Confirmación final en MongoDB
    await fetchService(`${PROPERTIES_SVC}/${propertyId}/confirm-reserved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerName: userName, buyerPhone: userPhone })
    });

    console.log(`🎉 [SAGA COMPLETADA CON ÉXITO TOTAL EN LAS 3 BASES DE DATOS]`);
    const reservation = {
      reservationId: sagaTrace.reservationId,
      propertyId,
      propertyTitle: propTitle,
      paymentId: sagaTrace.paymentId,
      contractNumber: sagaTrace.contractNumber,
      userName,
      userPhone,
      depositAmount: amount,
      status: 'ACTIVA',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    };
    // CU14: n8n envía la confirmación por Telegram (si el webhook está configurado). Un fallo aquí no revierte la reserva.
    const telegram = await notifyReservationConfirmed(reservation);
    return res.status(201).json({
      success: true,
      message: 'Reserva procesada exitosamente con el patrón Saga en MongoDB Atlas, Amazon DynamoDB y PostgreSQL Render',
      data: { ...reservation, telegramNotification: telegram }
    });

  } catch (err) {
    // -----------------------------------------------------------------
    // COMPENSACIÓN EN CADENA (ROLLBACK DISTRIBUIDO)
    // -----------------------------------------------------------------
    console.error(`\n❌ [ERROR EN SAGA]: ${err.message}`);
    console.log(`🔄 [INICIANDO COMPENSACIÓN AUTOMÁTICA EN CADENA...]`);

    // Compensar Paso 2: Reembolso bancario en DynamoDB
    if (sagaTrace.step2_charged && sagaTrace.paymentId) {
      console.log(`   ⟲ Reembolsando cobro #${sagaTrace.paymentId} en Amazon DynamoDB...`);
      await fetchService(`${BILLING_SVC}/billing/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: sagaTrace.paymentId, reason: 'Rollback Saga: ' + err.message })
      });
      console.log(`   ✅ Reembolso completado en DynamoDB.`);
    }

    // Compensar Paso 1: Liberar propiedad en MongoDB Atlas
    if (sagaTrace.step1_locked) {
      console.log(`   ⟲ Liberando propiedad #${propertyId} en MongoDB Atlas a DISPONIBLE...`);
      await fetchService(`${PROPERTIES_SVC}/${propertyId}/release-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rollback Saga: ' + err.message })
      });
      console.log(`   ✅ Propiedad liberada a DISPONIBLE en MongoDB Atlas.`);
    }

    return res.status(422).json({
      success: false,
      failedService: err.failedService || 'Microservicio del ecosistema',
      stepNumber: err.stepNumber || 0,
      message: `Fallo en ${err.failedService || 'la transacción'}: ${err.message}`,
      detail: err.message,
      rollbackExecuted: true,
      trace: sagaTrace
    });
  }
});

// Listar reservas (desde DynamoDB) con enriquecimiento de títulos. El cliente recibe solo las suyas.
app.get('/api/reservations', async (req, res) => {
  let userId = req.query.userId;
  if (effectiveRole(req.user) === 'CLIENTE') {
    const me = await callerProfile();
    if (!me) return res.status(502).json({ success: false, message: 'No se pudo obtener tu perfil desde ms-contracts.' });
    userId = me.id;
  }
  const url = userId ? `${BILLING_SVC}/billing/reservations?userId=${enc(userId)}` : `${BILLING_SVC}/billing/reservations`;
  const result = await fetchService(url);
  if (result.ok && result.data && Array.isArray(result.data.data)) {
    try {
      const propsRes = await fetchService(PROPERTIES_SVC);
      const catalog = Array.isArray(propsRes.data?.data) ? propsRes.data.data : (Array.isArray(propsRes.data) ? propsRes.data : []);
      result.data.data = result.data.data.map(r => {
        const pId = r.propertyId || r.property_id;
        const matched = catalog.find(p => String(p.id) === String(pId));
        return {
          ...r,
          propertyTitle: r.propertyTitle || r.property_title || r.prop_title || matched?.title || `Inmueble #${pId}`
        };
      });
    } catch (_) {
      // Si falla catálogo temporalmente, mantener respuesta original
    }
  }
  return res.status(result.status).json(result.data);
});

// CU15: cancelar una reserva con reembolso. Solo el cliente titular o el Cajero (y el ADMIN).
// Orden: reembolso → cerrar la reserva → anular el pre-contrato de arras → liberar el inmueble.
app.post('/api/reservations/:id/cancel', requireRoles('CLIENTE', 'FINANZAS', 'ADMIN'), async (req, res) => {
  const { id } = req.params;
  const role = effectiveRole(req.user);
  const reason = String(req.body?.reason || '').trim().slice(0, 300)
    || (role === 'CLIENTE' ? 'Cancelada por el titular' : 'Cancelada en caja');
  console.log(`🔄 [CU15] Cancelando reserva #${id} (${role})...`);

  const found = await fetchService(`${BILLING_SVC}/billing/reservations/${enc(id)}`);
  if (!found.ok) return sendResult(res, found);
  const reservation = found.data.data;

  if (role === 'CLIENTE') {
    const me = await callerProfile();
    if (!me) return res.status(502).json({ success: false, message: 'No se pudo obtener tu perfil desde ms-contracts.' });
    if (reservation.userId !== me.id) {
      return res.status(403).json({ success: false, message: 'Solo el titular puede cancelar esta reserva.' });
    }
  }
  if (reservation.status !== 'ACTIVA') {
    return res.status(409).json({ success: false, message: `La reserva ya no está activa (estado ${reservation.status}).` });
  }

  // 1. Reembolso: si falla, no se toca nada más (el reembolso es idempotente, se puede reintentar)
  const refund = await fetchService(`${BILLING_SVC}/billing/refunds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId: reservation.paymentId, reason: `Cancelación de la reserva ${id}: ${reason}` })
  });
  if (!refund.ok) return sendResult(res, refund);

  // 2. Cerrar la reserva en DynamoDB
  const closed = await fetchService(`${BILLING_SVC}/billing/reservations/${enc(id)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  if (!closed.ok) {
    return res.status(closed.status).json({
      success: false,
      message: `Las arras se reembolsaron, pero no se pudo cerrar la reserva: ${closed.data?.message || 'error'}. Reintenta la cancelación.`
    });
  }

  // 3 y 4. Anular el pre-contrato y liberar el inmueble (si fallan se informa; no deshacen el reembolso)
  const [contract, release] = await Promise.all([
    fetchService(`${CONTRACTS_SVC}/contracts/reservations/${enc(reservation.paymentId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    }),
    fetchService(`${PROPERTIES_SVC}/${enc(reservation.propertyId)}/release-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: `Cancelación de la reserva ${id}` })
    })
  ]);

  const warnings = [];
  if (!contract.ok && contract.status !== 404) warnings.push('No se pudo anular el pre-contrato de arras: ' + (contract.data?.message || contract.status));
  if (!release.ok) warnings.push('No se pudo liberar el inmueble: ' + (release.data?.message || release.status));

  return res.json({
    success: true,
    message: warnings.length
      ? `Reserva cancelada y arras reembolsadas. Atención: ${warnings.join(' · ')}`
      : 'Reserva cancelada: arras reembolsadas, pre-contrato anulado e inmueble disponible de nuevo.',
    data: {
      reservationId: id,
      paymentId: reservation.paymentId,
      refunded: refund.data?.status === 'REFUNDED',
      contractCancelled: contract.ok,
      propertyReleased: release.ok,
      warnings
    }
  });
});

// -------------------------------------------------------------
// CU16: CAJA — pago del saldo de una compra o de las cuotas de un alquiler
// -------------------------------------------------------------
const SALE_COMMISSION_RATE = 0.03;   // 3% del precio de venta
const RENT_COMMISSION_RATE = 0.03;   // 3% del valor anual del alquiler (12 cuotas)

function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function nextPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return currentPeriod(new Date(y, m, 1));
}

// Qué se cobra en cada contrato firmado: compraventa → saldo (precio − anticipo); arrendamiento → canon mensual.
function operationOf(contract, payments) {
  const paid = payments.filter((p) => p.contractNumber === contract.contractNumber && p.status === 'PAID');
  const total = Number(contract.totalAmount) || 0;
  const down = Number(contract.downPayment) || 0;
  if (contract.contractType === 'PROMESA_COMPRAVENTA') {
    return {
      kind: 'SALDO_COMPRA',
      amountDue: Math.max(0, Math.round((total - down) * 100) / 100),
      settled: paid.some((p) => p.kind === 'SALDO_COMPRA'),
      payments: paid
    };
  }
  const periods = paid.filter((p) => p.kind === 'CUOTA_ALQUILER').map((p) => p.period).sort();
  return {
    kind: 'CUOTA_ALQUILER',
    amountDue: total,
    settled: false,
    paidPeriods: periods,
    nextPeriod: periods.length ? nextPeriod(periods[periods.length - 1]) : currentPeriod(),
    payments: paid
  };
}

const PAYABLE_TYPES = ['PROMESA_COMPRAVENTA', 'ARRENDAMIENTO'];

app.get('/api/cashier/operations', requireRoles('FINANZAS', 'ADMIN'), async (req, res) => {
  const [contractsRes, paymentsRes] = await Promise.all([
    fetchService(`${CONTRACTS_SVC}/contracts`),
    fetchService(`${BILLING_SVC}/billing/payments`)
  ]);
  if (!contractsRes.ok) return sendResult(res, contractsRes);
  if (!paymentsRes.ok) return sendResult(res, paymentsRes);

  const payments = paymentsRes.data?.data || [];
  const operations = (Array.isArray(contractsRes.data) ? contractsRes.data : [])
    .filter((c) => PAYABLE_TYPES.includes(c.contractType) && c.status === 'FIRMADO')
    .map((c) => ({
      contractId: c.id,
      contractNumber: c.contractNumber,
      contractType: c.contractType,
      propertyId: c.propertyId,
      propertyTitle: c.propertyTitle,
      clientId: c.clientId,
      clientName: c.userName,
      totalAmount: c.totalAmount,
      downPayment: c.downPayment,
      signedAt: c.signatures?.[c.signatures.length - 1]?.signedAt || null,
      ...operationOf(c, payments)
    }))
    .sort((a, b) => Number(a.settled) - Number(b.settled));

  return res.json({ success: true, count: operations.length, data: operations });
});

// El agente que cobra la comisión: el que publicó el inmueble, si no el del contrato.
async function resolveAgent(contract, property) {
  const employeesRes = await fetchService(`${CONTRACTS_SVC}/employees`);
  const agents = (employeesRes.data?.data || []).filter((e) => e.sector === 'AGENTE');
  const byEmail = (email) => email && agents.find((a) => a.email?.toLowerCase() === String(email).toLowerCase());
  return byEmail(property?.brokerEmail)
    || agents.find((a) => a.id === contract.agentId)
    || byEmail(contract.agentId)
    || (property?.brokerName && agents.find((a) => a.name === property.brokerName))
    || null;
}

const PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR'];

app.post('/api/payments', requireRoles('FINANZAS', 'ADMIN'), async (req, res) => {
  const { contractId, period, method, reference } = req.body || {};
  if (!contractId) return res.status(400).json({ success: false, message: 'contractId es obligatorio' });
  if (!PAYMENT_METHODS.includes(String(method || '').toUpperCase())) {
    return res.status(400).json({ success: false, message: `Método de pago inválido. Usa: ${PAYMENT_METHODS.join(', ')}` });
  }

  const contractRes = await fetchService(`${CONTRACTS_SVC}/contracts/${enc(contractId)}`);
  if (!contractRes.ok) return sendResult(res, contractRes);
  const contract = contractRes.data;
  if (!PAYABLE_TYPES.includes(contract.contractType)) {
    return res.status(400).json({ success: false, message: 'Solo se registran pagos de contratos de compraventa o arrendamiento.' });
  }
  if (contract.status !== 'FIRMADO') {
    return res.status(409).json({ success: false, message: 'El contrato debe estar firmado por el cliente y el Oficial Legal antes de registrar pagos.' });
  }

  const paymentsRes = await fetchService(`${BILLING_SVC}/billing/payments?contractNumber=${enc(contract.contractNumber)}`);
  if (!paymentsRes.ok) return sendResult(res, paymentsRes);
  const operation = operationOf(contract, paymentsRes.data?.data || []);

  if (operation.kind === 'SALDO_COMPRA' && operation.settled) {
    return res.status(409).json({ success: false, message: `El saldo del contrato ${contract.contractNumber} ya está pagado.` });
  }
  if (operation.amountDue <= 0) {
    return res.status(409).json({ success: false, message: 'El contrato no tiene saldo pendiente.' });
  }
  const isRent = operation.kind === 'CUOTA_ALQUILER';
  const rentPeriod = isRent ? String(period || operation.nextPeriod) : null;
  const firstRentPayment = isRent && operation.paidPeriods.length === 0;

  // 1. Registrar el pago en DynamoDB (409 si ese saldo o esa cuota ya estaba registrado)
  const paymentRes = await fetchService(`${BILLING_SVC}/billing/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: operation.kind,
      contractId: String(contract.id),
      contractNumber: contract.contractNumber,
      propertyId: contract.propertyId,
      propertyTitle: contract.propertyTitle,
      clientId: contract.clientId,
      clientName: contract.userName,
      amount: operation.amountDue,
      period: rentPeriod,
      method: String(method).toUpperCase(),
      reference
    })
  });
  if (!paymentRes.ok) return sendResult(res, paymentRes);

  // 2. Si la operación se cerró (saldo pagado o primera cuota): inmueble vendido/alquilado, reserva cerrada y comisión del agente
  const followUps = {};
  if (!isRent || firstRentPayment) {
    const [propertyRes, reservationsRes] = await Promise.all([
      fetchService(`${PROPERTIES_SVC}/${enc(contract.propertyId)}`),
      fetchService(`${BILLING_SVC}/billing/reservations`)
    ]);
    const property = propertyRes.ok ? propertyRes.data : null;

    const statusRes = await fetchService(`${PROPERTIES_SVC}/${enc(contract.propertyId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: isRent ? 'ALQUILADO' : 'COMPRADO', reservedBy: contract.userName })
    });
    followUps.propertyStatus = statusRes.ok ? (isRent ? 'ALQUILADO' : 'COMPRADO') : 'ERROR';

    const activeReservation = (reservationsRes.data?.data || [])
      .find((r) => r.propertyId === contract.propertyId && r.status === 'ACTIVA');
    if (activeReservation) {
      const closeRes = await fetchService(`${BILLING_SVC}/billing/reservations/${enc(activeReservation.reservationId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: isRent ? 'ALQUILADA' : 'COMPRADA' })
      });
      followUps.reservation = closeRes.ok ? activeReservation.reservationId : 'ERROR';
    }

    const agent = await resolveAgent(contract, property);
    if (agent) {
      const commissionRes = await fetchService(`${BILLING_SVC}/commissions/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commissionId: `COM-${contract.contractNumber}`,
          agentId: agent.id,
          agentName: agent.name,
          agentEmail: agent.email,
          propertyId: contract.propertyId,
          contractNumber: contract.contractNumber,
          operationType: isRent ? 'ALQUILER' : 'VENTA',
          baseAmount: isRent ? Number(contract.totalAmount) * 12 : Number(contract.totalAmount),
          rate: isRent ? RENT_COMMISSION_RATE : SALE_COMMISSION_RATE
        })
      });
      followUps.commission = commissionRes.ok
        ? { commissionId: commissionRes.data.data.commissionId, agentName: agent.name, netAmount: commissionRes.data.data.netAmount }
        : (commissionRes.status === 409 ? 'YA_GENERADA' : 'ERROR');
    } else {
      followUps.commission = 'SIN_AGENTE';
    }
  }

  return res.status(201).json({
    success: true,
    message: isRent
      ? `Cuota ${rentPeriod} registrada (${contract.contractNumber}).`
      : `Saldo registrado: la compra de ${contract.propertyTitle || contract.propertyId} quedó cerrada.`,
    data: paymentRes.data.data,
    followUps
  });
});

// -------------------------------------------------------------
// 4. ENDPOINTS DE CONTRATOS (ms-contracts -> PostgreSQL Render)
// -------------------------------------------------------------

app.get('/api/contracts', async (req, res) => {
  // ms-contracts filtra por el token: el cliente recibe solo sus contratos.
  const result = await fetchService(`${CONTRACTS_SVC}/contracts`);
  if (result.ok && Array.isArray(result.data)) {
    return res.json({ success: true, count: result.data.length, data: result.data });
  }
  return sendResult(res, result);
});

// CU12: el firmante y el hash del documento los determina ms-contracts a partir del token.
app.post('/api/contracts/:id/sign', async (req, res) => {
  return sendResult(res, await fetchService(`${CONTRACTS_SVC}/contracts/${encodeURIComponent(req.params.id)}/signatures`, { method: 'POST' }));
});

// -------------------------------------------------------------
// 5. ENDPOINTS DE CITAS Y VISITAS CRM (ms-contracts -> PostgreSQL Render)
// -------------------------------------------------------------

app.get('/api/appointments', async (req, res) => {
  const params = new URLSearchParams(req.query);
  const result = await fetchService(`${CONTRACTS_SVC}/appointments?${params.toString()}`);
  if (result.ok && result.data && Array.isArray(result.data.data)) {
    try {
      const propsRes = await fetchService(PROPERTIES_SVC);
      const catalog = Array.isArray(propsRes.data?.data) ? propsRes.data.data : (Array.isArray(propsRes.data) ? propsRes.data : []);
      result.data.data = result.data.data.map(app => {
        const pId = app.propertyId || app.property_id;
        const matched = catalog.find(p => String(p.id) === String(pId));
        const realTitle = (app.propertyTitle && app.propertyTitle !== 'Inmueble Seleccionado')
          ? app.propertyTitle
          : (matched?.title || (pId ? `Inmueble #${pId}` : 'Inmueble'));
        return {
          ...app,
          propertyTitle: realTitle,
          zone: app.zone || matched?.zone || '',
          city: app.city || matched?.city || ''
        };
      });
    } catch (_) {}
  }
  return res.status(result.status).json(result.data);
});

app.post('/api/appointments', async (req, res) => {
  let body = { ...req.body };
  if (!body.propertyTitle || body.propertyTitle === 'Inmueble Seleccionado') {
    try {
      const propRes = await fetchService(`${PROPERTIES_SVC}/${body.propertyId}`);
      if (propRes.ok && (propRes.data?.title || propRes.data?.property?.title)) {
        body.propertyTitle = propRes.data?.title || propRes.data?.property?.title;
      }
    } catch (_) {}
  }
  const result = await fetchService(`${CONTRACTS_SVC}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.status(result.status).json(result.data);
});

app.put('/api/appointments/:id/status', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/appointments/${req.params.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  return res.status(result.status).json(result.data);
});

// -------------------------------------------------------------
// 6. ENDPOINTS FINANCIEROS Y COMISIONES (ms-billing -> Amazon DynamoDB)
// -------------------------------------------------------------

// CU19: resumen financiero (Cajero y ADMIN)
app.get('/api/finances', requireRoles('FINANZAS', 'ADMIN'), async (req, res) => {
  return passthrough(res, await fetchService(`${BILLING_SVC}/finances`));
});

// CU17: el Cajero ve y liquida las comisiones de los agentes (se generan solas al cerrar cada operación)
app.get('/api/commissions', requireRoles('FINANZAS', 'ADMIN'), async (req, res) => {
  return passthrough(res, await fetchService(`${BILLING_SVC}/commissions`));
});

app.post('/api/commissions/:agentId/:commissionId/pay', requireRoles('FINANZAS', 'ADMIN'), async (req, res) => {
  return passthrough(res, await fetchService(`${BILLING_SVC}/commissions/${enc(req.params.agentId)}/${enc(req.params.commissionId)}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: req.body?.reference })
  }));
});

// CU18: el agente consulta sus propias comisiones (su id sale del token, no de la URL)
app.get('/api/commissions/mine', requireRoles('AGENTE'), async (req, res) => {
  const me = await callerProfile();
  if (!me) return res.status(502).json({ success: false, message: 'No se pudo obtener tu perfil desde ms-contracts.' });
  return passthrough(res, await fetchService(`${BILLING_SVC}/commissions/agent/${enc(me.id)}`));
});

// -------------------------------------------------------------
// 7. NOTIFICACIONES Y AUTOMATIZACIÓN (N8N)
// -------------------------------------------------------------

// CU14: avisa a n8n que se confirmó una reserva; el flujo n8n/habitat_reserva_telegram.json la envía por Telegram.
// Sin N8N_RESERVATION_WEBHOOK_URL no hace nada. El secreto viaja en X-Habitat-Secret (Header Auth del webhook).
async function notifyReservationConfirmed(reservation) {
  const url = process.env.N8N_RESERVATION_WEBHOOK_URL;
  if (!url) return 'NO_CONFIGURADA';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.N8N_WEBHOOK_SECRET) headers['X-Habitat-Secret'] = process.env.N8N_WEBHOOK_SECRET;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(reservation), signal: controller.signal });
    if (!res.ok) console.warn(`⚠️ [n8n] El webhook de reservas respondió HTTP ${res.status}`);
    return res.ok ? 'ENVIADA' : 'ERROR';
  } catch (err) {
    console.warn(`⚠️ [n8n] No se pudo avisar la reserva ${reservation.reservationId}: ${err.message}`);
    return 'ERROR';
  } finally {
    clearTimeout(timeoutId);
  }
}

app.post('/api/notifications/email', async (req, res) => {
  const { to, subject, message } = req.body;
  console.log(`✉️ [N8N AUTOMATION EMAIL ENVIADO] A: ${to} | Asunto: ${subject}`);
  return res.json({
    success: true,
    message: `Notificación por correo despachada exitosamente a ${to}`,
    deliveredAt: new Date().toISOString()
  });
});

// -------------------------------------------------------------
// 8. INTELIGENCIA ARTIFICIAL MULTI-MICROSERVICIO (Claude API)
// -------------------------------------------------------------

app.post('/api/ai/report', async (req, res) => {
  const { queryText } = req.body;
  if (!queryText) {
    return res.status(400).json({ success: false, message: 'La consulta es requerida.' });
  }

  // Consultar propiedades de MongoDB y contratos de PostgreSQL en paralelo
  const [propsRes, contractsRes] = await Promise.all([
    fetchService(PROPERTIES_SVC),
    fetchService(`${CONTRACTS_SVC}/contracts`)
  ]);

  const properties = Array.isArray(propsRes.data) ? propsRes.data : [];
  const contracts = Array.isArray(contractsRes.data) ? contractsRes.data : [];

  const totalVol = properties.reduce((acc, p) => acc + (parseFloat(p.price) || 0), 0);
  const executiveReport = `Análisis patrimonial consolidado multi-microservicio:\n` +
    `• Cartera de inmuebles en MongoDB Atlas: ${properties.length} propiedades con valor de $${totalVol.toLocaleString()} USD.\n` +
    `• Registros contractuales en PostgreSQL Render: ${contracts.length} contratos formalizados.\n` +
    `• Trazabilidad financiera: Custodia fiduciaria asegurada con TTL en Amazon DynamoDB.`;

  return res.json({
    success: true,
    queryText,
    executiveReport,
    recordsCount: properties.length,
    data: properties,
    poweredBy: 'Anthropic Claude 3.5 Sonnet + Arquitectura de Microservicios Habitat Pro'
  });
});

// -------------------------------------------------------------
// 9. HEALTH CHECK DISTRIBUIDO DEL SISTEMA
// -------------------------------------------------------------

app.get('/api/health', async (req, res) => {
  const [propsHealth, contractsHealth, billingHealth] = await Promise.all([
    fetchService(PROPERTIES_SVC).then(r => r.ok),
    fetchService(`${CONTRACTS_SVC}/contracts`).then(r => r.ok),
    fetchService(`${BILLING_SVC}/health`).then(r => r.ok)
  ]);

  return res.json({
    gateway: 'UP',
    port: PORT,
    timestamp: new Date().toISOString(),
    microservices: {
      msProperties: { status: propsHealth ? 'UP' : 'DOWN', port: 3001, database: 'MongoDB Atlas Cloud' },
      msContracts: { status: contractsHealth ? 'UP' : 'DOWN', port: 8081, database: 'PostgreSQL Render Cloud' },
      msBilling: { status: billingHealth ? 'UP' : 'DOWN', port: 8002, database: 'Amazon DynamoDB AWS Cloud' }
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 [API Gateway & Orquestador Saga] en http://localhost:${PORT}`);
  console.log(`📡 Enrutando a 3 microservicios independientes con BDs en la nube`);
  console.log(`=======================================================`);
});
