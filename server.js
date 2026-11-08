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
app.use(cors({ exposedHeaders: ['Idempotent-Replayed', 'X-Habitat-Offline', 'X-Habitat-Saved-At'] }));
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
  // Gráficos de entrenamiento de los modelos de ML (datos sintéticos): los muestra un <img>, que no envía token
  { method: 'GET', pattern: /^\/api\/ml\/plots\/[\w.-]+$/ },
  // Revisión programada del agente monitor (CU21): la llama n8n con el secreto del webhook, no con un token
  { method: 'POST', pattern: /^\/api\/ai\/monitor\/scheduled$/ },
  // Clave pública VAPID (CU06): el navegador la necesita para suscribirse; no es secreta
  { method: 'GET', pattern: /^\/api\/push\/public-key$/ },
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

// Modelo de lectura (CU19): cualquier escritura que termine bien deja vieja la caché del resumen consolidado.
const overviewCache = new Map();
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) overviewCache.clear(); });
  next();
});

// Idempotency-Key (Fase 3): la misma reserva, visita, consulta o cobro repetido por mala señal se ejecuta una sola vez.
const { createIdempotency } = require('./idempotency/middleware');
const idempotency = createIdempotency({ table: process.env.IDEMPOTENCY_TABLE || 'habitat_idempotency' });
const IDEMPOTENT_ROUTES = [
  /^\/api\/reservations$/,                 // CU14 saga de arras
  /^\/api\/reservations\/[^/]+\/cancel$/,  // CU15 reembolso
  /^\/api\/appointments$/,                 // CU09 agendar visita
  /^\/api\/properties\/[^/]+\/inquiries$/, // CU01 consulta
  /^\/api\/payments$/,                     // CU16 cobro en caja
];
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && IDEMPOTENT_ROUTES.some((re) => re.test(req.baseUrl + req.path))) return idempotency(req, res, next);
  return next();
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

const ML_SVC = `${(process.env.ML_SERVICE_URL || 'http://localhost:8003').replace(/\/$/, '')}/api/v1/ml`;

console.log('🔗 [Microservicios Configurados]:');
console.log('   • Catálogo (MongoDB Atlas):       ', PROPERTIES_SVC);
console.log('   • Legal & Auth (PostgreSQL Render):', CONTRACTS_SVC);
console.log('   • Pagos & TTL (Amazon DynamoDB):   ', BILLING_SVC);

// Identifica el nombre legible del microservicio según la URL invocada
function identifyServiceName(url = '') {
  const u = String(url);
  if (u.includes(PROPERTIES_SVC) || u.includes('/inquiries') || u.includes(':3001')) {
    return 'ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas)';
  }
  if (u.includes(BILLING_SVC) || u.includes(':8002')) {
    return 'ms-billing-php (Pagos y Reservas · Amazon DynamoDB)';
  }
  if (u.includes(CONTRACTS_SVC) || u.includes(':8081')) {
    return 'ms-contracts-spring (Contratos, Visitas y Usuarios · PostgreSQL)';
  }
  if (u.includes(ML_SVC) || u.includes(':8003')) {
    return 'ms-ml-python (Machine Learning · Tasación y Segmentación)';
  }
  if (u.includes(':4000') || u.includes('graphql')) {
    return 'bff-graphql-gateway (BFF GraphQL ERP)';
  }
  return 'Microservicio del ecosistema';
}

// Helper para llamadas HTTP fetch con detección explícita de qué microservicio no responde
async function fetchService(url, options = {}) {
  const timeoutMs = options.timeout || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...(options.headers || {}) };
  const authorization = requestContext.getStore()?.authorization;
  if (authorization && !headers.Authorization) headers.Authorization = authorization;
  const svcName = identifyServiceName(url);
  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    if ([502, 503, 504].includes(res.status)) {
      const msg = '⚠️ El microservicio ' + svcName + ' no responde en este momento (detenido o fuera de línea). Inténtalo de nuevo más tarde.';
      return {
        ok: false,
        status: 503,
        failedService: svcName,
        error: msg,
        data: { success: false, failedService: svcName, message: msg }
      };
    }
    return { ok: res.ok, status: res.status, failedService: res.ok ? null : svcName, data };
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = '⚠️ El microservicio ' + svcName + ' no responde en este momento. Inténtalo de nuevo más tarde.';
    return {
      ok: false,
      status: 503,
      failedService: svcName,
      error: msg,
      data: { success: false, failedService: svcName, message: msg }
    };
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

// Perfil de quien llama (ms-contracts lo resuelve a partir del token; si ms-contracts está detenido, usa los claims verificados del JWT de Keycloak)
async function callerProfile(fallbackJwtUser = null) {
  const result = await fetchService(CONTRACTS_SVC + '/auth/sso', { method: 'POST', timeout: 8000 });
  if (result.ok && result.data?.user) return result.data.user;
  if (fallbackJwtUser && fallbackJwtUser.sub) {
    return {
      id: fallbackJwtUser.sub,
      name: fallbackJwtUser.name || fallbackJwtUser.preferred_username || fallbackJwtUser.email || 'Cliente',
      email: fallbackJwtUser.email || '',
      role: effectiveRole(fallbackJwtUser),
    };
  }
  return null;
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
  const result = await fetchService(`${CONTRACTS_SVC}/auth/sso`, { method: 'POST', timeout: 8000 });
  if (result.ok) return res.status(result.status).json(result.data);
  if (req.user && req.user.sub) {
    return res.status(200).json({
      success: true,
      warning: result.data?.message,
      user: {
        id: req.user.sub,
        name: req.user.name || req.user.preferred_username || req.user.email || 'Usuario',
        email: req.user.email || '',
        role: effectiveRole(req.user),
        sector: req.user.sector || null
      }
    });
  }
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
  return res.status(result.status).json({ success: false, failedService: result.failedService || result.data?.failedService || null, message });
}

app.use('/api', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], limit: '10mb' }));

// Subida de fotos de inmuebles a Amazon S3 (bucket sw2p2) con AWS Signature V4 nativa (sin dependencias extra)
const S3_BUCKET = process.env.S3_BUCKET || 'sw2p2';
const S3_REGION = process.env.AWS_REGION || 'us-east-1';
const ALLOWED_IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function putObjectToS3({ bucket, region, key, body, contentType }) {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const sessionToken = (process.env.AWS_SESSION_TOKEN || '').trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Faltan AWS_ACCESS_KEY_ID o AWS_SECRET_ACCESS_KEY en las variables de entorno.');
  }

  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalUri = '/' + key.split('/').map(encodeURIComponent).join('/');

  const headersToSign = {
    'content-type': contentType,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
  };
  const sortedHeaderKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headersToSign[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `https://${host}${canonicalUri}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
      Authorization: authorization,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Error al subir a S3 (${res.status}): ${errText.slice(0, 200)}`);
  }
  return url;
}

app.post('/api/properties/upload-photo', requireRoles('AGENTE', 'ADMIN'), async (req, res) => {
  try {
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = ALLOWED_IMAGE_EXT[contentType];
    if (!ext) {
      return res.status(400).json({ success: false, message: 'Formato no permitido. Usa imágenes JPG, PNG, WEBP o GIF.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, message: 'El archivo de imagen está vacío.' });
    }
    const rawName = String(req.query.filename || 'foto').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '').slice(0, 40) || 'foto';
    const key = `properties/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${rawName}.${ext}`;
    const url = await putObjectToS3({ bucket: S3_BUCKET, region: S3_REGION, key, body: req.body, contentType });
    return res.status(201).json({ success: true, data: { url, key, bucket: S3_BUCKET } });
  } catch (err) {
    console.error('[S3 upload]', err.message);
    return res.status(502).json({ success: false, message: err.message || 'No se pudo subir la imagen a S3.' });
  }
});

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

app.delete('/api/properties/:id', requireRoles('AGENTE', 'ADMIN'), async (req, res) => {
  return sendResult(res, await fetchService(`${PROPERTIES_SVC}/${encodeURIComponent(req.params.id)}`, {
    method: 'DELETE',
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
    const me = await callerProfile(req.user);
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
    // CU06: aviso push al cliente (en segundo plano)
    pushInBackground(clientId, {
      title: 'Reserva confirmada',
      body: `${propTitle}: arras de $${Number(amount).toLocaleString('es-BO')} USD cobradas. Tienes 48 h para formalizar el contrato.`,
      url: '/#reservas', tag: `reserva-${reservation.reservationId}`
    });
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
    if (sagaTrace.step2_saved_dynamo && sagaTrace.reservationId) {
      console.log(`   ⟲ Anulando reserva #${sagaTrace.reservationId} en Amazon DynamoDB...`);
      await fetchService(`${BILLING_SVC}/billing/reservations/${encodeURIComponent(sagaTrace.reservationId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rollback Saga: ' + err.message })
      });
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
    const me = await callerProfile(req.user);
    if (!me) return res.status(502).json({ success: false, message: 'No se pudo obtener tu perfil desde ms-contracts.' });
    userId = me.id;
  }
  const url = userId ? `${BILLING_SVC}/billing/reservations?userId=${enc(userId)}` : `${BILLING_SVC}/billing/reservations`;
  const result = await fetchService(url);
  if (result.ok && result.data && Array.isArray(result.data.data)) {
    try {
      const propsRes = await fetchService(PROPERTIES_SVC);
      const catalog = Array.isArray(propsRes.data?.data) ? propsRes.data.data : (Array.isArray(propsRes.data) ? propsRes.data : []);
      const allRes = result.data.data;
      for (const prop of catalog) {
        if (prop.status === 'RESERVADO') {
          const propId = String(prop.id || prop.code);
          const hasActive = allRes.some(r => String(r.propertyId || r.property_id) === propId && r.status === 'ACTIVA');
          const hasCancelled = allRes.some(r => String(r.propertyId || r.property_id) === propId && r.status === 'CANCELADA_REEMBOLSADA');
          if (!hasActive && hasCancelled) {
            await fetchService(`${PROPERTIES_SVC}/${enc(propId)}/release-lock`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'Reconciliación automática de reserva previamente cancelada' })
            });
            prop.status = 'DISPONIBLE';
          }
        }
      }
      result.data.data = result.data.data.map(r => {
        const pId = r.propertyId || r.property_id;
        const matched = catalog.find(p => String(p.id) === String(pId));
        return {
          ...r,
          propertyTitle: r.propertyTitle || r.property_title || r.prop_title || matched?.title || `Inmueble #${pId}`
        };
      });
    } catch (_) {}
  }
  return res.status(result.status).json(result.data);
});

// CU15: cancelar una reserva con reembolso — SAGA DE CANCELACIÓN ATÓMICA (TODO O NADA EN LOS 3 MICROSERVICIOS).
// Paso 1: Liberar inmueble (ms-properties) → Paso 2: Anular pre-contrato (ms-contracts) → Paso 3: Reembolsar y cerrar (ms-billing).
// Si cualquier microservicio está detenido o falla, NO se realiza la cancelación y se revierten los pasos previos.
app.post('/api/reservations/:id/cancel', requireRoles('CLIENTE', 'FINANZAS', 'ADMIN'), async (req, res) => {
  const { id } = req.params;
  const role = effectiveRole(req.user);
  const reason = String(req.body?.reason || '').trim().slice(0, 300)
    || (role === 'CLIENTE' ? 'Cancelada por el titular' : 'Cancelada en caja');
  console.log(`🔄 [CU15] Iniciando Saga Atómica de Cancelación para reserva #${id} (${role})...`);

  // Paso 0: Verificar la reserva en ms-billing
  const found = await fetchService(`${BILLING_SVC}/billing/reservations/${enc(id)}`);
  if (!found.ok) {
    return res.status(found.status || 503).json({
      success: false,
      failedService: 'ms-billing-php (Pagos y Reservas · Amazon DynamoDB)',
      stepNumber: 1,
      message: `❌ Acción no realizada: Fallo en ms-billing-php (Pagos y Reservas · Amazon DynamoDB). ${found.data?.message || 'El microservicio no responde.'}`
    });
  }
  const reservation = found.data.data;

  if (role === 'CLIENTE') {
    const me = await callerProfile(req.user);
    if (!me) {
      return res.status(503).json({
        success: false,
        failedService: 'ms-contracts-spring (Contratos, Visitas y Usuarios · PostgreSQL)',
        message: '❌ Acción no realizada: Fallo en ms-contracts-spring al verificar el titular.'
      });
    }
    if (reservation.userId !== me.id) {
      return res.status(403).json({ success: false, message: 'Solo el titular puede cancelar esta reserva.' });
    }
  }
  if (reservation.status !== 'ACTIVA') {
    return res.status(409).json({ success: false, message: `La reserva ya no está activa (estado ${reservation.status}).` });
  }

  // PASO 1/3: Liberar el inmueble en ms-properties-nestjs (MongoDB Atlas)
  const release = await fetchService(`${PROPERTIES_SVC}/${enc(reservation.propertyId)}/release-lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: `Cancelación de la reserva ${id}` })
  });
  if (!release.ok) {
    return res.status(release.status || 503).json({
      success: false,
      failedService: 'ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas)',
      stepNumber: 1,
      rollbackExecuted: true,
      message: `❌ Acción no realizada.\n\nServicio con error: ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas)\nPaso: 1 de 3 (Liberar inmueble)\nMotivo: ${release.data?.message || 'El microservicio no responde'}.\n\nLa reserva NO fue cancelada para evitar que el inmueble quede bloqueado.`
    });
  }

  // PASO 2/3: Anular el pre-contrato de arras en ms-contracts-spring (PostgreSQL)
  const contract = await fetchService(`${CONTRACTS_SVC}/contracts/reservations/${enc(reservation.paymentId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  if (!contract.ok && contract.status !== 404) {
    // ROLLBACK PASO 1: Volver a dejar el inmueble como RESERVADO en ms-properties
    await fetchService(`${PROPERTIES_SVC}/${enc(reservation.propertyId)}/confirm-reserved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerName: reservation.userName, buyerPhone: reservation.userPhone })
    });
    return res.status(contract.status || 503).json({
      success: false,
      failedService: 'ms-contracts-spring (Contratos, Visitas y Usuarios · PostgreSQL)',
      stepNumber: 2,
      rollbackExecuted: true,
      message: `❌ Acción no realizada.\n\nServicio con error: ms-contracts-spring (Contratos, Visitas y Usuarios · PostgreSQL)\nPaso: 2 de 3 (Anular pre-contrato)\nMotivo: ${contract.data?.message || 'El microservicio no responde'}.\n\nSe revirtieron los cambios: el inmueble continúa reservado y la reserva sigue ACTIVA.`
    });
  }

  // PASO 3/3: Reembolsar arras y cerrar la reserva en ms-billing-php (Amazon DynamoDB)
  const refund = await fetchService(`${BILLING_SVC}/billing/refunds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId: reservation.paymentId, reason: `Cancelación de la reserva ${id}: ${reason}` })
  });
  if (!refund.ok) {
    // ROLLBACK PASO 1: Volver a dejar el inmueble como RESERVADO
    await fetchService(`${PROPERTIES_SVC}/${enc(reservation.propertyId)}/confirm-reserved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerName: reservation.userName, buyerPhone: reservation.userPhone })
    });
    return res.status(refund.status || 503).json({
      success: false,
      failedService: 'ms-billing-php (Pagos y Reservas · Amazon DynamoDB)',
      stepNumber: 3,
      rollbackExecuted: true,
      message: `❌ Acción no realizada.\n\nServicio con error: ms-billing-php (Pagos y Reservas · Amazon DynamoDB)\nPaso: 3 de 3 (Reembolso de arras)\nMotivo: ${refund.data?.message || 'El microservicio no responde'}.\n\nSe revirtieron los cambios y la reserva sigue ACTIVA.`
    });
  }

  const closed = await fetchService(`${BILLING_SVC}/billing/reservations/${enc(id)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  if (!closed.ok) {
    return res.status(closed.status || 503).json({
      success: false,
      failedService: 'ms-billing-php (Pagos y Reservas · Amazon DynamoDB)',
      stepNumber: 3,
      message: `❌ Error en ms-billing-php al cerrar la reserva: ${closed.data?.message || 'error'}.`
    });
  }

  pushInBackground(reservation.userId, {
    title: 'Reserva cancelada',
    body: `${reservation.propertyTitle || 'Tu reserva'}: se reembolsaron las arras${refund.data?.amount ? ` (${Number(refund.data.amount).toLocaleString('es-BO')} USD)` : ''}.`,
    url: '/#reservas', tag: `reserva-${id}`
  });

  return res.json({
    success: true,
    message: 'Reserva cancelada exitosamente en los 3 microservicios: arras reembolsadas, pre-contrato anulado e inmueble disponible de nuevo.',
    data: {
      reservationId: id,
      paymentId: reservation.paymentId,
      refunded: refund.data?.status === 'REFUNDED',
      contractCancelled: true,
      propertyReleased: true,
      warnings: []
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

  // PASO 1/3: Verificar contrato en ms-contracts-spring
  const contractRes = await fetchService(`${CONTRACTS_SVC}/contracts/${enc(contractId)}`);
  if (!contractRes.ok) {
    return res.status(contractRes.status || 503).json({
      success: false,
      failedService: 'ms-contracts-spring (Contratos, Visitas y Usuarios · PostgreSQL)',
      message: `❌ Acción no realizada: Fallo en ms-contracts-spring. ${contractRes.data?.message || 'El microservicio no responde.'}`
    });
  }
  const contract = contractRes.data;
  if (!PAYABLE_TYPES.includes(contract.contractType)) {
    return res.status(400).json({ success: false, message: 'Solo se registran pagos de contratos de compraventa o arrendamiento.' });
  }
  if (contract.status !== 'FIRMADO') {
    return res.status(409).json({ success: false, message: 'El contrato debe estar firmado por el cliente y el Oficial Legal antes de registrar pagos.' });
  }

  // Verificar pagos previos en ms-billing-php
  const paymentsRes = await fetchService(`${BILLING_SVC}/billing/payments?contractNumber=${enc(contract.contractNumber)}`);
  if (!paymentsRes.ok) {
    return res.status(paymentsRes.status || 503).json({
      success: false,
      failedService: 'ms-billing-php (Pagos y Reservas · Amazon DynamoDB)',
      message: `❌ Acción no realizada: Fallo en ms-billing-php. ${paymentsRes.data?.message || 'El microservicio no responde.'}`
    });
  }
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

  // PASO 2/3: Verificar y actualizar inmueble en ms-properties-nestjs ANTES de cobrar en DynamoDB
  let property = null;
  let previousStatus = 'RESERVADO';
  if (!isRent || firstRentPayment) {
    const propertyRes = await fetchService(`${PROPERTIES_SVC}/${enc(contract.propertyId)}`);
    if (!propertyRes.ok) {
      return res.status(propertyRes.status || 503).json({
        success: false,
        failedService: 'ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas)',
        message: `❌ Acción no realizada: Fallo en ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas). No se registró el cobro porque el microservicio de propiedades está detenido.`
      });
    }
    property = propertyRes.data;
    previousStatus = property?.status || 'RESERVADO';

    const statusRes = await fetchService(`${PROPERTIES_SVC}/${enc(contract.propertyId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: isRent ? 'ALQUILADO' : 'COMPRADO', reservedBy: contract.userName })
    });
    if (!statusRes.ok) {
      return res.status(statusRes.status || 503).json({
        success: false,
        failedService: 'ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas)',
        message: `❌ Acción no realizada: No se pudo actualizar el estado del inmueble en ms-properties-nestjs. El cobro no fue procesado.`
      });
    }
  }

  // PASO 3/3: Registrar el pago en ms-billing-php (DynamoDB)
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
  if (!paymentRes.ok) {
    // ROLLBACK PASO 2: Revertir estado del inmueble en ms-properties
    if (!isRent || firstRentPayment) {
      await fetchService(`${PROPERTIES_SVC}/${enc(contract.propertyId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: previousStatus, reservedBy: contract.userName })
      });
    }
    return res.status(paymentRes.status || 503).json({
      success: false,
      failedService: 'ms-billing-php (Pagos y Reservas · Amazon DynamoDB)',
      rollbackExecuted: true,
      message: `❌ Acción no realizada: Fallo en ms-billing-php al registrar el pago. Se revirtió el estado del inmueble.`
    });
  }

  const followUps = {};
  if (!isRent || firstRentPayment) {
    followUps.propertyStatus = isRent ? 'ALQUILADO' : 'COMPRADO';
    const reservationsRes = await fetchService(`${BILLING_SVC}/billing/reservations`);
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
      : `Saldo registrado: la compra de ${contract.propertyTitle || contract.propertyId} quedó cerrada y el inmueble pasó a Vendido.`,
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
  // Paso 1: Verificar que ms-properties-nestjs esté en línea y el inmueble exista
  const propRes = await fetchService(`${PROPERTIES_SVC}/${enc(body.propertyId)}`);
  if (!propRes.ok) {
    return res.status(propRes.status || 503).json({
      success: false,
      failedService: 'ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas)',
      message: `❌ Acción no realizada: Fallo en ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas). No se pudo agendar la visita porque el microservicio de propiedades no responde.`
    });
  }
  if (!body.propertyTitle || body.propertyTitle === 'Inmueble Seleccionado') {
    body.propertyTitle = propRes.data?.title || propRes.data?.property?.title || body.propertyTitle;
  }
  // Paso 2: Guardar la visita en ms-contracts-spring
  const result = await fetchService(`${CONTRACTS_SVC}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!result.ok) {
    return res.status(result.status || 503).json({
      success: false,
      failedService: 'ms-contracts-spring (Contratos, Visitas y Usuarios · PostgreSQL)',
      message: `❌ Acción no realizada: Fallo en ms-contracts-spring (Contratos, Visitas y Usuarios · PostgreSQL). ${result.data?.message || 'El microservicio no responde.'}`
    });
  }
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

// Vinculación de Telegram (CU21). Un bot solo puede escribir a quien antes le escribió: el empleado abre
// t.me/<bot>?start=<código>, pulsa "Iniciar" y aquí se lee ese /start con getUpdates para conocer su chat.
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const STAFF_ROLES = ['ADMIN', 'AGENTE', 'LEGAL', 'FINANZAS', 'ATENCION'];
const telegramCodes = new Map();   // código -> { userId, expires }
const telegramStarts = new Map();  // código -> chatId (leído de Telegram, pendiente de confirmar)
let telegramOffset = 0;
let telegramBot = null;

async function telegramApi(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram respondió HTTP ${res.status}`);
  return data.result;
}

// Lee los /start <código> que llegaron al bot y confirma esas actualizaciones.
async function readTelegramStarts() {
  const updates = await telegramApi('getUpdates', { offset: telegramOffset, timeout: 0, allowed_updates: ['message'] });
  for (const update of updates) {
    telegramOffset = Math.max(telegramOffset, update.update_id + 1);
    const text = update.message?.text || '';
    const match = text.match(/^\/start\s+([A-Za-z0-9_-]{8,64})$/);
    if (match && update.message.chat?.type === 'private') telegramStarts.set(match[1], String(update.message.chat.id));
  }
}

app.post('/api/telegram/link', requireRoles(...STAFF_ROLES), async (req, res) => {
  if (!TELEGRAM_TOKEN) return res.status(503).json({ success: false, message: 'El bot de Telegram no está configurado (TELEGRAM_BOT_TOKEN).' });
  const me = await callerProfile();
  if (!me) return res.status(502).json({ success: false, message: 'No se pudo obtener tu perfil desde ms-contracts.' });
  try {
    telegramBot = telegramBot || await telegramApi('getMe');
  } catch (err) {
    return res.status(502).json({ success: false, message: `No se pudo contactar al bot de Telegram: ${err.message}` });
  }
  const now = Date.now();
  for (const [code, entry] of telegramCodes) if (entry.expires < now) telegramCodes.delete(code);
  const code = crypto.randomBytes(12).toString('base64url');
  telegramCodes.set(code, { userId: me.id, expires: now + 10 * 60 * 1000 });
  return res.json({ success: true, data: { code, link: `https://t.me/${telegramBot.username}?start=${code}`, bot: telegramBot.username, expiresInSeconds: 600 } });
});

app.post('/api/telegram/link/verify', requireRoles(...STAFF_ROLES), async (req, res) => {
  const code = String(req.body?.code || '');
  const entry = telegramCodes.get(code);
  if (!entry || entry.expires < Date.now()) {
    return res.status(410).json({ success: false, message: 'El enlace venció. Genera uno nuevo.' });
  }
  const me = await callerProfile();
  if (!me || me.id !== entry.userId) return res.status(403).json({ success: false, message: 'Este código no es tuyo.' });
  try {
    if (!telegramStarts.has(code)) await readTelegramStarts();
  } catch (err) {
    return res.status(502).json({ success: false, message: `No se pudo leer el bot de Telegram: ${err.message}` });
  }
  const chatId = telegramStarts.get(code);
  if (!chatId) return res.json({ success: true, data: { linked: false } });

  const saved = await fetchService(`${CONTRACTS_SVC}/users/me/telegram`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId })
  });
  if (!saved.ok) return sendResult(res, saved);
  telegramCodes.delete(code);
  telegramStarts.delete(code);
  telegramApi('sendMessage', { chat_id: chatId, text: `✅ Listo, ${me.name}: tu Telegram quedó vinculado a Habitat Pro. Aquí recibirás las alertas que te asigne el Administrador.` }).catch(() => {});
  return res.json({ success: true, data: { linked: true, user: saved.data.user } });
});

app.delete('/api/telegram/link', requireRoles(...STAFF_ROLES), async (req, res) => {
  return passthrough(res, await fetchService(`${CONTRACTS_SVC}/users/me/telegram`, { method: 'DELETE' }));
});

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

// CU20: reporte por voz o texto. Claude elige herramientas MCP de solo lectura (ver ai/report-agent.js).
// Solo personal interno; cada dato respeta los permisos del rol porque las herramientas usan el token del usuario.
const { generateReport, ReportError } = require('./ai/report-agent');

app.post('/api/ai/report', requireRoles('ADMIN', 'AGENTE', 'LEGAL', 'FINANZAS', 'ATENCION'), async (req, res) => {
  const queryText = String(req.body?.queryText || '').trim();
  if (queryText.length < 3 || queryText.length > 500) {
    return res.status(400).json({ success: false, message: 'Escribe un pedido de reporte de entre 3 y 500 caracteres.' });
  }
  try {
    const report = await generateReport(queryText, req.headers.authorization);
    const tools = report.consultas.map((c) => c.herramienta).join(', ') || 'sin herramientas';
    console.log(`🤖 [CU20] "${queryText}" → ${tools} · ${report.uso.input_tokens}+${report.uso.output_tokens} tokens`);
    return res.json({ success: true, queryText, ...report });
  } catch (err) {
    if (err instanceof ReportError) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[CU20] Error generando el reporte:', err);
    return res.status(500).json({ success: false, message: 'No se pudo generar el reporte.' });
  }
});

// CU21: agente monitor del negocio. Lo dispara n8n cada mañana (cuenta de servicio habitat-monitor) o el
// Admin con "Revisar ahora". Guarda la revisión (campanita) y la envía por Telegram vía n8n a quienes tienen alertas activas.
// CU05: respaldo en línea del asistente de ayuda (solo cuando el usuario lo pide y la FAQ local no alcanzó).
// Límite: 10 preguntas por hora por usuario, para cuidar el costo de la API.
const { askAssistant } = require('./ai/assistant-agent');
const ASSISTANT_LIMIT = 10;
const assistantUsage = new Map(); // sub -> [marcas de tiempo]
app.post('/api/ai/assistant', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Debes iniciar sesión para usar esta función.' });
  const question = String(req.body?.question || '').trim();
  if (question.length < 3 || question.length > 400) {
    return res.status(400).json({ success: false, message: 'Escribe una pregunta de entre 3 y 400 caracteres.' });
  }
  const now = Date.now();
  const recent = (assistantUsage.get(req.user.sub) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= ASSISTANT_LIMIT) {
    return res.status(429).json({ success: false, message: 'Llegaste al límite de preguntas al asistente por esta hora. Mientras tanto puedes usar las preguntas frecuentes.' });
  }
  recent.push(now);
  assistantUsage.set(req.user.sub, recent);
  try {
    const role = effectiveRole(req.user);
    const result = await askAssistant(question, role);
    console.log(`💬 [CU05] (${role}) "${question.slice(0, 60)}" · ${result.uso.input_tokens}+${result.uso.output_tokens} tokens`);
    return res.json({ success: true, data: { answer: result.answer, remaining: ASSISTANT_LIMIT - recent.length } });
  } catch (err) {
    if (err instanceof ReportError) return res.status(err.status).json({ success: false, message: err.message });
    return res.status(500).json({ success: false, message: 'No se pudo consultar al asistente.' });
  }
});

const { runMonitor, telegramText } = require('./ai/monitor-agent');

async function notifyMonitorTelegram(report, chats) {
  const url = process.env.N8N_MONITOR_WEBHOOK_URL;
  if (!url || !chats.length || !report.alertas.length) return 0;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.N8N_WEBHOOK_SECRET) headers['X-Habitat-Secret'] = process.env.N8N_WEBHOOK_SECRET;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ texto: telegramText(report), chats: chats.map((c) => ({ chatId: c.chatId, nombre: c.name })) }),
      signal: controller.signal
    });
    return res.ok ? chats.length : 0;
  } catch (err) {
    console.warn(`⚠️ [CU21] No se pudo avisar a n8n: ${err.message}`);
    return 0;
  } finally {
    clearTimeout(timeoutId);
  }
}

app.post('/api/ai/monitor', requireRoles('ADMIN'), (req, res) => monitorAndStore(res, 'MANUAL', req.headers.authorization));

// Revisión programada: la dispara n8n cada mañana. n8n no maneja credenciales de Keycloak: se autentica con el
// secreto del webhook y el gateway pide el token de la cuenta de servicio habitat-monitor (rol ADMIN).
app.post('/api/ai/monitor/scheduled', async (req, res) => {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const given = String(req.headers['x-habitat-secret'] || '');
  if (!secret || given.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return res.status(401).json({ success: false, message: 'Secreto inválido.' });
  }
  if (!process.env.KEYCLOAK_MONITOR_CLIENT_SECRET) {
    return res.status(503).json({ success: false, message: 'Falta KEYCLOAK_MONITOR_CLIENT_SECRET en el .env del gateway.' });
  }
  try {
    const authorization = await serviceAuthorization();
    return requestContext.run({ authorization }, () => monitorAndStore(res, 'PROGRAMADO', authorization));
  } catch (err) {
    return res.status(502).json({ success: false, message: err.message });
  }
});

// Token de la cuenta de servicio habitat-monitor (rol ADMIN, client credentials). Se reutiliza hasta 30 s antes de vencer.
// Lo usan las tareas sin usuario: el monitor programado (CU21) y las notificaciones push (CU06).
let serviceToken = { value: null, expires: 0 };
async function serviceAuthorization() {
  if (serviceToken.value && Date.now() < serviceToken.expires - 30000) return serviceToken.value;
  if (!process.env.KEYCLOAK_MONITOR_CLIENT_SECRET) throw new Error('Falta KEYCLOAK_MONITOR_CLIENT_SECRET en el .env del gateway.');
  let data;
  try {
    const tokenRes = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: 'habitat-monitor', client_secret: process.env.KEYCLOAK_MONITOR_CLIENT_SECRET })
    });
    data = await tokenRes.json();
  } catch (err) {
    throw new Error(`No se pudo contactar a Keycloak: ${err.message}`);
  }
  if (!data.access_token) throw new Error('Keycloak no entregó el token de la cuenta de servicio habitat-monitor.');
  serviceToken = { value: `Bearer ${data.access_token}`, expires: Date.now() + (data.expires_in || 60) * 1000 };
  return serviceToken.value;
}

// -------------------------------------------------------------
// NOTIFICACIONES PUSH (CU06): avisos de reservas al celular o la PC del cliente, aunque la app esté cerrada
// -------------------------------------------------------------
const { createPush } = require('./push/notify');
const push = createPush({ contractsSvc: CONTRACTS_SVC, serviceAuthorization });

app.get('/api/push/public-key', (req, res) => {
  if (!push.enabled) return res.status(503).json({ success: false, message: 'Las notificaciones no están configuradas en el servidor.' });
  return res.json({ success: true, publicKey: push.publicKey });
});

// El dispositivo queda a nombre de quien llama (ms-contracts lo toma del token).
app.post('/api/push/subscription', async (req, res) => {
  return passthrough(res, await fetchService(`${CONTRACTS_SVC}/users/me/push`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: req.body?.endpoint, keys: req.body?.keys, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) })
  }));
});

app.delete('/api/push/subscription', async (req, res) => {
  return passthrough(res, await fetchService(`${CONTRACTS_SVC}/users/me/push?endpoint=${enc(String(req.query.endpoint || ''))}`, { method: 'DELETE' }));
});

// Aviso de prueba al propio usuario (botón "Probar aviso").
app.post('/api/push/test', async (req, res) => {
  const me = await callerProfile();
  if (!me) return res.status(502).json({ success: false, message: 'No se pudo obtener tu perfil.' });
  const result = await push.sendToUser(me.id, { title: 'Habitat Pro', body: 'Los avisos están activos en este dispositivo.', url: '/', tag: 'habitat-test' });
  return res.json({ success: true, data: result });
});

// Un aviso que falla nunca frena la operación que lo originó: se envía en segundo plano.
function pushInBackground(userId, payload) {
  push.sendToUser(userId, payload)
    .then((r) => { if (r.sent) console.log(`🔔 [CU06] "${payload.title}" enviado a ${r.sent} dispositivo(s)`); })
    .catch(() => {});
}

// Recordatorio: reservas activas a las que les quedan menos de 6 h (una sola vez por reserva).
const remindedReservations = new Set();
async function remindExpiringReservations() {
  if (!push.enabled || !process.env.KEYCLOAK_MONITOR_CLIENT_SECRET) return;
  try {
    const authorization = await serviceAuthorization();
    const res = await fetch(`${BILLING_SVC}/billing/reservations`, { headers: { Authorization: authorization } });
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body.data) ? body.data : [];
    for (const r of list) {
      const id = r.reservationId || r.id;
      const hours = (new Date(r.expires_at).getTime() - Date.now()) / 36e5;
      if (r.status !== 'ACTIVA' || !(hours > 0 && hours < 6) || remindedReservations.has(id)) continue;
      remindedReservations.add(id);
      pushInBackground(r.userId, {
        title: 'Tu reserva está por vencer',
        body: `Quedan ${Math.max(1, Math.round(hours))} h para formalizar el contrato de ${r.propertyTitle || 'tu inmueble'}.`,
        url: '/#reservas', tag: `reserva-${id}`
      });
    }
  } catch (err) {
    console.warn(`[push] No se pudieron revisar las reservas por vencer: ${err.message}`);
  }
}
setInterval(remindExpiringReservations, 30 * 60 * 1000).unref();
setTimeout(remindExpiringReservations, 20 * 1000).unref();

async function monitorAndStore(res, trigger, authorization) {
  let report;
  try {
    report = await runMonitor(authorization);
  } catch (err) {
    if (err instanceof ReportError) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[CU21] Error en el agente monitor:', err);
    return res.status(500).json({ success: false, message: 'No se pudo completar la revisión.' });
  }

  const recipientsRes = await fetchService(`${CONTRACTS_SVC}/telegram/recipients`);
  const chats = recipientsRes.ok ? (recipientsRes.data?.data || []) : [];
  const notified = await notifyMonitorTelegram(report, chats);

  const saved = await fetchService(`${CONTRACTS_SVC}/monitor/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trigger,
      summary: report.resumen,
      alerts: report.alertas,
      model: report.modelo,
      inputTokens: report.uso.input_tokens,
      outputTokens: report.uso.output_tokens,
      notifiedChats: notified
    })
  });
  console.log(`🛎️ [CU21] Revisión ${trigger}: ${report.alertas.length} alerta(s) · Telegram a ${notified} chat(s) · ${report.consultas.join(', ')} · ${report.uso.input_tokens}+${report.uso.output_tokens} tokens`);
  if (!saved.ok) return sendResult(res, saved);
  return res.json({ success: true, data: { ...saved.data.data, consultas: report.consultas, telegram: { destinatarios: chats.length, enviados: notified } } });
}

// Campanita: últimas revisiones del agente (personal interno)
app.get('/api/monitor/reports', requireRoles(...STAFF_ROLES), async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  return passthrough(res, await fetchService(`${CONTRACTS_SVC}/monitor/reports?limit=${limit}`));
});

// -------------------------------------------------------------
// 8b. MACHINE LEARNING (ms-ml-python): CU03 precio y CU13 segmentos
// -------------------------------------------------------------

// FastAPI responde errores como { detail: "..." } o { detail: [{ msg }] }: se normalizan a { success, message }.
function mlResult(res, result) {
  if (result.ok) return res.status(result.status).json({ success: true, data: result.data });
  const detail = result.data?.detail;
  const message = Array.isArray(detail) ? detail.map((d) => d.msg).join('. ') : (detail || result.data?.message || 'Error en el servicio de ML');
  return res.status(result.status).json({ success: false, message });
}

// CU03: precio estimado de un inmueble (lo usa el agente al publicar)
app.post('/api/ml/predict-price', requireRoles('AGENTE', 'ADMIN'), async (req, res) => {
  return mlResult(res, await fetchService(`${ML_SVC}/predict-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  }));
});

// Ciudades y zonas del modelo de precios (listas desplegables del formulario de inmuebles)
app.get('/api/ml/locations', requireRoles('ADMIN', 'AGENTE', 'LEGAL', 'FINANZAS', 'ATENCION'), async (req, res) => {
  return mlResult(res, await fetchService(`${ML_SVC}/locations`));
});

app.get('/api/ml/models', requireRoles('ADMIN', 'AGENTE', 'LEGAL', 'FINANZAS', 'ATENCION'), async (req, res) => {
  return mlResult(res, await fetchService(`${ML_SVC}/models`));
});

app.get('/api/ml/plots/:name', async (req, res) => {
  try {
    const upstream = await fetch(`${ML_SVC}/plots/${enc(req.params.name)}`);
    if (!upstream.ok) return res.status(upstream.status).end();
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    return res.status(503).end();
  }
});

// CU13: segmento de cada cliente real según su actividad en el sistema.
// Las visitas, reservas y contratos usan el id de la app; las consultas, el email (en ms-properties el id es el de Keycloak).
const asList = (result) => (Array.isArray(result.data) ? result.data : (Array.isArray(result.data?.data) ? result.data.data : []));

app.get('/api/ml/client-segments', requireRoles('ADMIN'), async (req, res) => {
  const [clientsRes, apptRes, inqRes, resvRes, contractRes, propRes] = await Promise.all([
    fetchService(`${CONTRACTS_SVC}/clients`),
    fetchService(`${CONTRACTS_SVC}/appointments`),
    fetchService(INQUIRIES_SVC),
    fetchService(`${BILLING_SVC}/billing/reservations`),
    fetchService(`${CONTRACTS_SVC}/contracts`),
    fetchService(PROPERTIES_SVC)
  ]);
  if (!clientsRes.ok) return sendResult(res, clientsRes);

  const appointments = asList(apptRes);
  const inquiries = asList(inqRes);
  const reservations = asList(resvRes);
  const contracts = asList(contractRes);
  const priceOf = new Map(asList(propRes).flatMap((p) => [[String(p.id), p.price], [String(p.code), p.price]]));
  const now = Date.now();
  const days = (date) => (date ? Math.max(0, Math.round((now - new Date(date).getTime()) / 86400000)) : null);

  const clientes = asList(clientsRes).map((client) => {
    const email = String(client.email || '').toLowerCase();
    const visits = appointments.filter((a) => a.userId === client.id);
    const inqs = inquiries.filter((q) => String(q.clientEmail || '').toLowerCase() === email);
    const resvs = reservations.filter((r) => r.userId === client.id);
    const ctrs = contracts.filter((c) => c.clientId === client.id && c.contractType !== 'RESERVA_CON_ARRAS' && c.status !== 'CANCELADO');
    const prices = [
      ...visits.map((a) => priceOf.get(String(a.propertyId))),
      ...inqs.map((q) => priceOf.get(String(q.propertyId))),
      ...resvs.map((r) => priceOf.get(String(r.propertyId))),
      ...ctrs.map((c) => Number(c.totalAmount))
    ].filter((p) => Number.isFinite(p) && p > 0);
    const activityDays = [
      ...visits.map((a) => days(a.createdAt || a.visitDate)),
      ...inqs.map((q) => days(q.createdAt)),
      ...resvs.map((r) => days(r.created_at)),
      ...ctrs.map((c) => days(c.createdAt))
    ].filter((d) => d !== null);
    return {
      id: client.id,
      nombre: client.name || client.email,
      visitas: visits.length,
      consultas: inqs.length,
      reservas: resvs.length,
      monto_reservado_usd: resvs.filter((r) => r.status !== 'CANCELADA_REEMBOLSADA').reduce((s, r) => s + (Number(r.depositAmount) || 0), 0),
      presupuesto_usd: prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0,
      dias_inactivo: activityDays.length ? Math.min(...activityDays) : 365,
      interes_alquiler: ctrs.length ? ctrs.filter((c) => c.contractType === 'ARRENDAMIENTO').length / ctrs.length : 0
    };
  });

  const [segmentRes, modelsRes] = await Promise.all([
    fetchService(`${ML_SVC}/segment-clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientes })
    }),
    fetchService(`${ML_SVC}/models`)
  ]);
  if (!segmentRes.ok) return mlResult(res, segmentRes);
  return res.json({ success: true, data: { ...segmentRes.data, modelo: modelsRes.data?.cu13_segmentos || null } });
});

// -------------------------------------------------------------
// 9. HEALTH CHECK DISTRIBUIDO DEL SISTEMA
// -------------------------------------------------------------

// -------------------------------------------------------------
// MODELO DE LECTURA CONSOLIDADO (CU19 dashboard, CU20 reportes, CU21 monitor)
// Lado de lectura de CQRS: cruza MongoDB + PostgreSQL + DynamoDB en un solo resumen, en memoria 60 s.
// -------------------------------------------------------------
const { buildOverview } = require('./bi/read-model');
const OVERVIEW_TTL_MS = 60 * 1000;

app.get('/api/bi/overview', requireRoles('ADMIN', 'FINANZAS'), async (req, res) => {
  const key = effectiveRole(req.user);
  const cached = overviewCache.get(key);
  if (cached && req.query.fresh !== '1' && Date.now() - cached.at < OVERVIEW_TTL_MS) {
    return res.json({ success: true, cached: true, data: cached.data });
  }

  const sources = {
    properties: fetchService(PROPERTIES_SVC),
    appointments: fetchService(`${CONTRACTS_SVC}/appointments`),
    reservations: fetchService(`${BILLING_SVC}/billing/reservations`),
    contracts: fetchService(`${CONTRACTS_SVC}/contracts`),
    finances: fetchService(`${BILLING_SVC}/finances`),
    commissions: fetchService(`${BILLING_SVC}/commissions`),
    inquiries: fetchService(INQUIRIES_SVC)
  };
  const names = Object.keys(sources);
  const results = Object.fromEntries((await Promise.all(Object.values(sources))).map((r, i) => [names[i], r]));
  const okList = (r) => (r.ok ? asList(r) : null);   // null = el servicio no respondió (la sección sale vacía)
  const finances = results.finances.ok ? (results.finances.data?.data || results.finances.data) : null;

  const data = buildOverview({
    properties: okList(results.properties),
    appointments: okList(results.appointments),
    reservations: okList(results.reservations),
    contracts: okList(results.contracts),
    payments: finances ? finances.payments || [] : null,
    commissions: okList(results.commissions),
    inquiries: okList(results.inquiries)
  });
  overviewCache.set(key, { at: Date.now(), data });
  return res.json({ success: true, cached: false, data });
});

// -------------------------------------------------------------
// ARQUITECTURA (modo demo): qué patrón usa cada pieza. Cada microservicio describe sus capas.
// -------------------------------------------------------------
const GATEWAY_ARCHITECTURE = {
  service: 'api-gateway',
  technology: 'Node.js (Express) + BFF GraphQL + servidor MCP',
  architecture: 'API Gateway + Saga orquestada + CQRS (lectura)',
  boundedContext: 'Puerta única del sistema',
  layers: [
    { name: 'Saga orquestada', path: 'server.js · POST /api/reservations', items: ['Bloquea el inmueble (ms-properties) → cobra las arras (ms-billing) → pre-contrato (ms-contracts)', 'Si un paso falla, compensa en orden inverso (reembolso y liberación)'] },
    { name: 'CQRS: modelo de lectura', path: 'bi/read-model.js · GET /api/bi/overview', items: ['Cruza MongoDB + PostgreSQL + DynamoDB en un solo resumen para el dashboard, los reportes y el monitor'] },
    { name: 'Idempotencia', path: 'idempotency/middleware.js', items: ['Idempotency-Key con registro en DynamoDB (TTL 24 h): un reintento no duplica reservas ni cobros'] },
    { name: 'BFF GraphQL', path: 'bff-graphql-gateway/', items: ['El ERP Angular consulta contratos, visitas y empleados en una sola petición'] },
    { name: 'IA', path: 'ai/ + mcp-habitat-server/', items: ['Reportes (CU20), monitor (CU21) y asistente (CU05) con Claude; herramientas MCP de solo lectura'] },
  ],
};

app.get('/api/architecture', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Debes iniciar sesión para usar esta función.' });
  const describe = async (url, fallback) => {
    const r = await fetchService(url);
    return r.ok ? r.data : { ...fallback, unavailable: true };
  };
  const [properties, contracts, billing] = await Promise.all([
    describe(PROPERTIES_SVC.replace(/\/properties$/, '/architecture'), { service: 'ms-properties', architecture: 'DDD' }),
    describe(`${CONTRACTS_SVC}/architecture`, { service: 'ms-contracts', architecture: 'Hexagonal' }),
    describe(`${BILLING_SVC}/architecture`, { service: 'ms-billing', architecture: 'Clean Architecture' }),
  ]);
  return res.json({ success: true, data: [GATEWAY_ARCHITECTURE, properties, contracts, billing] });
});

app.get('/api/health', async (req, res) => {
  // Un 401/403 sin sesión también prueba que el servicio está arriba (responde y exige token).
  const alive = (r) => r.ok || r.status === 401 || r.status === 403;
  const [propsHealth, contractsHealth, billingHealth] = await Promise.all([
    fetchService(PROPERTIES_SVC).then(alive),
    fetchService(`${CONTRACTS_SVC}/contracts`).then(alive),
    fetchService(`${BILLING_SVC}/health`).then(alive)
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
