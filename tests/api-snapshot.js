/**
 * Red de seguridad para los refactors de arquitectura (DDD / Hexagonal / Clean): SOLO LECTURA.
 *
 * Toma una "foto" de las respuestas de los 3 microservicios a través del gateway (y del BFF GraphQL) con
 * varios roles, incluidos los casos de error (404, 409, 403), y la compara con otra foto tomada después
 * del refactor. Si una ruta, un campo, un estado HTTP o un mensaje cambian, lo reporta.
 *
 *   node tests/api-snapshot.js save  <archivo.json>
 *   node tests/api-snapshot.js check <archivo.json>
 *
 * No escribe nada en las bases: las únicas peticiones POST son errores esperados (reservar un inmueble
 * que no está DISPONIBLE → 409), que el servicio rechaza antes de tocar datos.
 */
const fs = require('fs');

const API = process.env.HABITAT_API_URL || 'http://localhost:5000/api';
const KC = process.env.KEYCLOAK_TOKEN_URL || 'http://localhost:8080/realms/habitat/protocol/openid-connect/token';
const USERS = {
  admin: 'admin@habitat.pro',
  cliente: 'juan.comprador@habitat.pro',
  agente: 'carlos.broker@habitat.pro',
  legal: 'elena.ramos@habitat.pro',
  finanzas: 'maria.finanzas@habitat.pro',
};

// Campos que cambian solos con el tiempo (no son parte del contrato del API).
const VOLATILE = new Set(['generadoEn', 'cached', 'horas_para_vencer', 'dias_desde_creacion', 'dias_desde_generada', 'horas', 'dias', 'timestamp', 'remaining', 'distanceMeters']);

async function token(user) {
  const res = await fetch(KC, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'habitat-web', username: user, password: 'pass123' }) });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Sin token para ${user}`);
  return data.access_token;
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) if (!VOLATILE.has(k)) out[k] = normalize(value[k]);
    return out;
  }
  return value;
}

async function call(tok, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
  return { status: res.status, body: normalize(json) };
}

async function graphql(tok, query) {
  return call(tok, 'POST', '/graphql', { query });
}

async function snapshot() {
  const t = {};
  for (const [role, user] of Object.entries(USERS)) t[role] = await token(user);
  const props = (await call(t.admin, 'GET', '/properties')).body;
  const list = Array.isArray(props) ? props : props.data || [];
  const notAvailable = list.find((p) => p.status !== 'DISPONIBLE');
  const firstContract = ((await call(t.admin, 'GET', '/contracts')).body.data || [])[0];

  const cases = {
    // ms-properties (MongoDB)
    'GET /properties (sin sesión)': () => call(null, 'GET', '/properties'),
    'GET /properties?status=DISPONIBLE': () => call(t.cliente, 'GET', '/properties?status=DISPONIBLE'),
    'GET /properties/DEP-VALLE-101': () => call(t.cliente, 'GET', '/properties/DEP-VALLE-101'),
    'GET /properties/NO-EXISTE (404)': () => call(t.cliente, 'GET', '/properties/NO-EXISTE-SNAP'),
    'GET /properties/search/geo': () => call(t.cliente, 'GET', '/properties/search/geo?lat=-17.78&lng=-63.18&distance=20000'),
    'GET /properties/search/geo inválido (400)': () => call(t.cliente, 'GET', '/properties/search/geo?lat=999&lng=0'),
    'GET /inquiries (agente)': () => call(t.agente, 'GET', '/inquiries'),
    'GET /inquiries (cliente)': () => call(t.cliente, 'GET', '/inquiries'),
    // ms-contracts (PostgreSQL)
    'GET /contracts (admin)': () => call(t.admin, 'GET', '/contracts'),
    'GET /contracts (cliente)': () => call(t.cliente, 'GET', '/contracts'),
    'GET /contracts (legal)': () => call(t.legal, 'GET', '/contracts'),
    'GET /appointments (agente)': () => call(t.agente, 'GET', '/appointments'),
    'GET /appointments (cliente)': () => call(t.cliente, 'GET', '/appointments'),
    'GET /users (admin)': () => call(t.admin, 'GET', '/users'),
    'GET /users (cliente, 403)': () => call(t.cliente, 'GET', '/users'),
    'GET /monitor/reports': () => call(t.admin, 'GET', '/monitor/reports'),
    'GraphQL contracts + clients (legal)': () => graphql(t.legal, '{ contracts { id contractNumber contractType status totalAmount clientId propertyId signatures { signerRole } } clients { id name email } }'),
    'GraphQL employees (admin)': () => graphql(t.admin, '{ employees { id name email sector active telegramLinked telegramAlerts } }'),
    'GraphQL appointments (agente)': () => graphql(t.agente, '{ appointments { id propertyId visitDate visitTime status visitType } }'),
    'GraphQL employees (cliente, sin permiso)': () => graphql(t.cliente, '{ employees { id } }'),
    // ms-billing (DynamoDB)
    'GET /reservations (admin)': () => call(t.admin, 'GET', '/reservations'),
    'GET /reservations (cliente)': () => call(t.cliente, 'GET', '/reservations'),
    'GET /finances (finanzas)': () => call(t.finanzas, 'GET', '/finances'),
    'GET /finances (agente, 403)': () => call(t.agente, 'GET', '/finances'),
    'GET /commissions (finanzas)': () => call(t.finanzas, 'GET', '/commissions'),
    'GET /commissions/mine (agente)': () => call(t.agente, 'GET', '/commissions/mine'),
    'GET /cashier/operations (finanzas)': () => call(t.finanzas, 'GET', '/cashier/operations'),
    // Cruces de las 3 bases
    'GET /bi/overview?fresh=1': () => call(t.admin, 'GET', '/bi/overview?fresh=1'),
    'GET /ml/client-segments': () => call(t.admin, 'GET', '/ml/client-segments'),
  };
  if (notAvailable) {
    // Regla de negocio: no se puede bloquear un inmueble que no está DISPONIBLE (409, no toca datos).
    cases[`POST /properties/${notAvailable.code}/reserve-lock (no disponible, 409) [directo ms-properties]`] = async () => {
      const base = (process.env.PROPERTIES_URL || 'http://localhost:3001/api/v1/properties');
      const res = await fetch(`${base}/${notAvailable.code}/reserve-lock`, { method: 'POST', headers: { Authorization: `Bearer ${t.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 'SNAPSHOT', lockDurationMinutes: 1 }) });
      return { status: res.status, body: normalize(await res.json().catch(() => null)) };
    };
  }
  if (firstContract) cases['GraphQL contract(id)'] = () => graphql(t.admin, `{ contract(id: "${firstContract.id}") { id contractNumber status legalClauses signatures { signerRole } } }`);

  const out = {};
  for (const [name, fn] of Object.entries(cases)) {
    try { out[name] = await fn(); } catch (err) { out[name] = { error: err.message }; }
  }
  return out;
}

function diff(a, b, path = '', acc = []) {
  if (acc.length > 40) return acc;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { acc.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`); return acc; }
  if (Array.isArray(a)) {
    if (a.length !== b.length) acc.push(`${path}: ${a.length} elementos → ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) diff(a[i], b[i], `${path}[${i}]`, acc);
    return acc;
  }
  if (a && typeof a === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b)) acc.push(`${path}.${k}: falta en la respuesta nueva`);
      else if (!(k in a)) acc.push(`${path}.${k}: campo nuevo`);
      else diff(a[k], b[k], `${path}.${k}`, acc);
    }
    return acc;
  }
  if (a !== b) acc.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`);
  return acc;
}

(async () => {
  const [mode, file] = process.argv.slice(2);
  if (!['save', 'check'].includes(mode) || !file) {
    console.log('Uso: node tests/api-snapshot.js save|check <archivo.json>');
    process.exit(2);
  }
  const snap = await snapshot();
  if (mode === 'save') {
    fs.writeFileSync(file, JSON.stringify(snap, null, 1));
    const statuses = Object.entries(snap).map(([k, v]) => `${v.status ?? 'ERR'}  ${k}`);
    console.log(`Foto guardada (${Object.keys(snap).length} casos):\n${statuses.join('\n')}`);
    return;
  }
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  let failures = 0;
  for (const name of new Set([...Object.keys(base), ...Object.keys(snap)])) {
    const d = diff(base[name], snap[name]);
    if (d.length) { failures += 1; console.log(`DIFERENTE  ${name}\n   ${d.slice(0, 12).join('\n   ')}`); }
    else console.log(`igual      ${name}`);
  }
  console.log(failures ? `\n${failures} caso(s) cambiaron.` : `\nSin cambios: ${Object.keys(base).length} casos idénticos.`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
