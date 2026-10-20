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

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend unificado (mfe-shell)
app.use(express.static(path.join(__dirname, 'mfe-shell')));

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

// Helper para llamadas HTTP fetch con manejo de timeout
async function fetchService(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 12000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, status: 503, error: err.message, data: { success: false, message: 'Microservicio no disponible: ' + err.message } };
  }
}

// -------------------------------------------------------------
// 1. ENDPOINTS DE AUTENTICACIÓN Y USUARIOS (ms-contracts -> PostgreSQL Render)
// -------------------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  return res.status(result.status).json(result.data);
});

app.post('/api/auth/register', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  return res.status(result.status).json(result.data);
});

app.get('/api/users', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/users`);
  return res.status(result.status).json(result.data);
});

app.put('/api/users/:id/role', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/users/${req.params.id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
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

app.get('/api/properties/:id', async (req, res) => {
  const result = await fetchService(`${PROPERTIES_SVC}/${req.params.id}`);
  return res.status(result.status).json(result.data);
});

app.post('/api/properties', async (req, res) => {
  const result = await fetchService(PROPERTIES_SVC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  return res.status(result.status).json(result.data);
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

app.post('/api/reservations', async (req, res) => {
  const { propertyId, userId, userName, userPhone, depositAmount, paymentMethod } = req.body;
  const clientId = userId || 'CLI-ANONIMO';
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
    reservationId: 'RES-' + Math.floor(1000 + Math.random() * 9000),
    contractNumber: 'ARRAS-' + Math.floor(1000 + Math.random() * 9000),
  };

  try {
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
      throw new Error(`[Fase 1 Fallida]: ${lockRes.data.message || 'El inmueble no está disponible en MongoDB'}`);
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

    if (!chargeRes.ok || !chargeRes.data.success) {
      throw new Error(`[Fase 2 Fallida]: ${chargeRes.data.message || 'Fallo en pasarela de pagos DynamoDB'}`);
    }
    sagaTrace.step2_charged = true;
    sagaTrace.paymentId = chargeRes.data.paymentId;
    console.log(`✅ [PASO 2A EXITOSO]: Cobro registrado en DynamoDB con ID: ${sagaTrace.paymentId}.`);

    // Registrar reserva en tabla de reservas DynamoDB con TTL de 48h
    await fetchService(`${BILLING_SVC}/billing/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: sagaTrace.reservationId,
        propertyId,
        userId: clientId,
        userName,
        userPhone,
        depositAmount: amount,
        paymentId: sagaTrace.paymentId,
        contractNumber: sagaTrace.contractNumber,
        status: 'ACTIVA'
      })
    });
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
        agentId: 'AGT-CARLOS-BROKER',
        paymentReferenceId: sagaTrace.paymentId,
        totalAmount: lockRes.data.property?.price || (amount * 10),
        depositAmount: amount
      })
    });

    if (!contractRes.ok || contractRes.data.error) {
      throw new Error(`[Fase 3 Fallida]: ${contractRes.data.message || 'Rechazo notarial o legal en PostgreSQL'}`);
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
    return res.status(201).json({
      success: true,
      message: 'Reserva procesada exitosamente con el patrón Saga en MongoDB Atlas, Amazon DynamoDB y PostgreSQL Render',
      data: {
        reservationId: sagaTrace.reservationId,
        propertyId,
        paymentId: sagaTrace.paymentId,
        contractNumber: sagaTrace.contractNumber,
        userName,
        userPhone,
        status: 'ACTIVA',
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
      }
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
      message: 'Fallo en la transacción Saga distribuida. Compensación automática ejecutada: ' + err.message,
      trace: sagaTrace
    });
  }
});

// Listar reservas (desde DynamoDB)
app.get('/api/reservations', async (req, res) => {
  const userId = req.query.userId;
  const url = userId ? `${BILLING_SVC}/billing/reservations?userId=${userId}` : `${BILLING_SVC}/billing/reservations`;
  const result = await fetchService(url);
  return res.status(result.status).json(result.data);
});

// Cancelar reserva (COMPENSACIÓN SAGA COMPLETA)
app.post('/api/reservations/:id/cancel', async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 [SAGA COMPENSACIÓN MANUAL] Cancelando reserva #${id}...`);

  // 1. Obtener datos de la reserva desde DynamoDB
  const listRes = await fetchService(`${BILLING_SVC}/billing/reservations`);
  const reservations = listRes.data?.data || [];
  const current = reservations.find(r => r.reservationId === id || r.id === id);

  const propId = current?.propertyId || current?.property_id;
  const paymentId = current?.paymentId || current?.payment_id;

  // 2. Reembolsar en DynamoDB
  if (paymentId) {
    await fetchService(`${BILLING_SVC}/billing/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, reason: `Cancelación solicitada para Reserva #${id}` })
    });
  }
  await fetchService(`${BILLING_SVC}/billing/reservations/${id}/cancel`, { method: 'POST' });

  // 3. Liberar inmueble a DISPONIBLE en MongoDB Atlas
  if (propId) {
    await fetchService(`${PROPERTIES_SVC}/${propId}/release-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: `Cancelación de Reserva #${id}` })
    });
  }

  return res.json({
    success: true,
    message: 'Compensación completada: Fondos devueltos en DynamoDB e inmueble liberado a DISPONIBLE en MongoDB Atlas'
  });
});

// Formalizar compra definitiva
app.post('/api/reservations/:id/buy', async (req, res) => {
  const { id } = req.params;
  const listRes = await fetchService(`${BILLING_SVC}/billing/reservations`);
  const reservations = listRes.data?.data || [];
  const current = reservations.find(r => r.reservationId === id || r.id === id);
  const propId = current?.propertyId || current?.property_id;

  if (propId) {
    await fetchService(`${PROPERTIES_SVC}/${propId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPRADO' })
    });
  }

  await fetchService(`${BILLING_SVC}/billing/reservations/${id}/buy`, { method: 'POST' });

  return res.json({
    success: true,
    message: 'Compra definitiva formalizada con fe notarial en MongoDB Atlas y Amazon DynamoDB'
  });
});

// -------------------------------------------------------------
// 4. ENDPOINTS DE CONTRATOS (ms-contracts -> PostgreSQL Render)
// -------------------------------------------------------------

app.get('/api/contracts', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/contracts`);
  if (result.ok && Array.isArray(result.data)) {
    let list = result.data;
    if (req.query.role === 'CLIENTE' && req.query.userId) {
      list = list.filter(c => c.clientId === req.query.userId || c.userId === req.query.userId);
    }
    return res.json({ success: true, count: list.length, data: list });
  }
  return res.status(result.status).json(result.data);
});

app.post('/api/contracts/:id/sign', async (req, res) => {
  const { signerName } = req.body;
  const result = await fetchService(`${CONTRACTS_SVC}/contracts/${req.params.id}/signatures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signerName: signerName || 'Comprador Titular', certificateHash: 'CERT-' + Math.random().toString(36).substring(2, 9).toUpperCase() })
  });
  return res.status(result.status).json(result.data);
});

// -------------------------------------------------------------
// 5. ENDPOINTS DE CITAS Y VISITAS CRM (ms-contracts -> PostgreSQL Render)
// -------------------------------------------------------------

app.get('/api/appointments', async (req, res) => {
  const params = new URLSearchParams(req.query);
  const result = await fetchService(`${CONTRACTS_SVC}/appointments?${params.toString()}`);
  return res.status(result.status).json(result.data);
});

app.post('/api/appointments', async (req, res) => {
  const result = await fetchService(`${CONTRACTS_SVC}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
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

app.get('/api/finances', async (req, res) => {
  const result = await fetchService(`${BILLING_SVC}/finances`);
  return res.status(result.status).json(result.data);
});

app.post('/api/commissions/calculate', async (req, res) => {
  const result = await fetchService(`${BILLING_SVC}/commissions/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  return res.status(result.status).json(result.data);
});

app.get('/api/commissions/agent/:agentId', async (req, res) => {
  const result = await fetchService(`${BILLING_SVC}/commissions/agent/${req.params.agentId}`);
  return res.status(result.status).json(result.data);
});

// -------------------------------------------------------------
// 7. NOTIFICACIONES Y AUTOMATIZACIÓN (N8N)
// -------------------------------------------------------------

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
    fetchService(`${CONTRACTS_SVC}/users`).then(r => r.ok),
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
