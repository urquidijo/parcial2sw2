/**
 * Prueba de flujos de punta a punta (ESCRIBE en las bases compartidas, y deja el inmueble como estaba).
 *
 * Recorre las 3 arquitecturas refactorizadas a través del gateway:
 *  1. CU14 Reserva con arras (saga): ms-properties DDD (bloqueo/confirmación del agregado) → ms-billing Clean
 *     (ChargeArras + reserva) → ms-contracts Hexagonal (pre-contrato).
 *  2. Idempotency-Key: repetir la misma reserva devuelve la misma respuesta sin ejecutarla otra vez.
 *  3. Invariante DDD: el mismo inmueble no se puede reservar dos veces.
 *  4. CU11/CU12 Hexagonal: Legal genera un contrato, lo firma, no puede firmarlo dos veces y lo anula.
 *  5. CU15 Clean: el cliente cancela → reembolso, reserva cerrada, pre-contrato anulado, inmueble DISPONIBLE.
 *
 * Deja registros de prueba ANULADOS / REEMBOLSADOS (no cambia totales de ingresos: el cobro queda REFUNDED).
 *   node tests/flow-smoke.js
 */
const crypto = require('crypto');

const API = process.env.HABITAT_API_URL || 'http://localhost:5000/api';
const KC = process.env.KEYCLOAK_TOKEN_URL || 'http://localhost:8080/realms/habitat/protocol/openid-connect/token';
let failures = 0;
const ok = (cond, msg, extra = '') => { console.log(`${cond ? 'OK ' : 'MAL'}  ${msg}${extra ? `  (${extra})` : ''}`); if (!cond) failures += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function token(user) {
  const res = await fetch(KC, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'habitat-web', username: user, password: 'pass123' }) });
  return (await res.json()).access_token;
}
async function call(tok, method, path, body, extraHeaders = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, replayed: res.headers.get('idempotent-replayed') === 'true' };
}
const gql = (tok, query, variables) => call(tok, 'POST', '/graphql', { query, variables });
const list = (r) => (Array.isArray(r.data) ? r.data : r.data?.data || []);

(async () => {
  const juan = await token('juan.comprador@habitat.pro');
  const legal = await token('elena.ramos@habitat.pro');
  const admin = await token('admin@habitat.pro');

  // Inmueble DISPONIBLE y sin contratos activos (para no chocar con datos reales).
  const props = list(await call(admin, 'GET', '/properties'));
  const contracts = list(await call(admin, 'GET', '/contracts'));
  const busy = new Set(contracts.filter((c) => !['CANCELADO', 'RECHAZADO'].includes(c.status)).map((c) => c.propertyId));
  const prop = props.find((p) => p.status === 'DISPONIBLE' && !busy.has(p.code) && !busy.has(p.id));
  if (!prop) { console.log('No hay un inmueble DISPONIBLE sin contratos activos para la prueba.'); process.exit(2); }
  console.log(`Inmueble de prueba: ${prop.code} (${prop.title}) · arras $${prop.deposit}\n`);

  // 1) Reserva con saga
  const key = crypto.randomUUID();
  const body = { propertyId: prop.id, userName: 'Juan Comprador', userPhone: '+59170000001', depositAmount: prop.deposit, paymentMethod: 'TARJETA' };
  const t0 = Date.now();
  const r1 = await call(juan, 'POST', '/reservations', body, { 'Idempotency-Key': key });
  const reservation = r1.data?.data || {};
  ok(r1.status === 201 && reservation.reservationId, '1. Saga de reserva completa (3 bases)', `${r1.status} · ${reservation.reservationId} · ${reservation.contractNumber} · ${Date.now() - t0} ms`);
  const afterRes = (await call(juan, 'GET', `/properties/${prop.code}`)).data;
  ok(afterRes.status === 'RESERVADO', '   DDD: el agregado Property quedó RESERVADO', afterRes.status);
  const arras = list(await call(admin, 'GET', '/contracts')).find((c) => c.contractNumber === reservation.contractNumber);
  ok(arras && arras.status === 'PENDIENTE_FIRMA' && arras.contractType === 'RESERVA_CON_ARRAS', '   Hexagonal: pre-contrato de arras PENDIENTE_FIRMA', arras?.contractNumber);
  const resInBilling = list(await call(juan, 'GET', '/reservations')).find((x) => (x.reservationId || x.id) === reservation.reservationId);
  ok(resInBilling && resInBilling.status === 'ACTIVA', '   Clean: reserva ACTIVA en DynamoDB', resInBilling?.status);

  // 2) Idempotencia
  const r2 = await call(juan, 'POST', '/reservations', body, { 'Idempotency-Key': key });
  ok(r2.replayed && r2.data?.data?.reservationId === reservation.reservationId, '2. Misma Idempotency-Key → misma respuesta, sin segunda saga', `${r2.status} replayed=${r2.replayed}`);

  // 3) Invariante del agregado: no se reserva dos veces
  const r3 = await call(juan, 'POST', '/reservations', body, { 'Idempotency-Key': crypto.randomUUID() });
  ok(r3.status >= 400 && /no puede ser reservada/.test(JSON.stringify(r3.data)), '3. DDD: segunda reserva del mismo inmueble rechazada', `${r3.status} · ${String(r3.data?.message || r3.data?.detail || '').slice(0, 90)}`);

  // 4) Contrato definitivo (Hexagonal): generar, firmar, no firmar dos veces, anular
  const create = await gql(legal, 'mutation($i: CreateContractInput!) { createContract(input: $i) { id contractNumber status } }', {
    i: { propertyId: prop.code, propertyTitle: prop.title, clientId: arras?.clientId, clientName: 'Juan Comprador', contractType: 'PROMESA_COMPRAVENTA', totalAmount: prop.price, downPayment: prop.deposit },
  });
  const ctr = create.data?.data?.createContract;
  ok(ctr && ctr.status === 'PENDIENTE_FIRMA', '4. Hexagonal: Legal genera el contrato de compraventa', ctr?.contractNumber || JSON.stringify(create.data?.errors?.[0]?.message));
  if (ctr) {
    const sign1 = await gql(legal, 'mutation($id: ID!) { signContract(id: $id) { status signatures { signerRole } } }', { id: ctr.id });
    ok(sign1.data?.data?.signContract?.signatures?.length === 1, '   firma del Oficial Legal registrada (sigue PENDIENTE_FIRMA)', sign1.data?.data?.signContract?.status);
    const sign2 = await gql(legal, 'mutation($id: ID!) { signContract(id: $id) { status } }', { id: ctr.id });
    ok(/ya tiene la firma del Oficial Legal/.test(JSON.stringify(sign2.data)), '   regla de dominio: no firma dos veces', sign2.data?.errors?.[0]?.message);
    const sign3 = await gql(juan, 'mutation($id: ID!) { signContract(id: $id) { status signatures { signerRole } } }', { id: ctr.id });
    ok(sign3.data?.data?.signContract?.status === 'FIRMADO', '   firma del cliente → contrato FIRMADO (2 de 2)', sign3.data?.data?.signContract?.status || sign3.data?.errors?.[0]?.message);
    const arrasConcluded = list(await call(admin, 'GET', '/contracts')).find((c) => c.contractNumber === reservation.contractNumber);
    ok(arrasConcluded?.status === 'CONCLUIDO', '   Hexagonal: el pre-contrato de arras pasó a CONCLUIDO', `${reservation.contractNumber} · ${arrasConcluded?.cancellationReason || ''}`);
    const cancel = await gql(legal, 'mutation($id: ID!) { cancelContract(id: $id, reason: "Prueba de regresión del refactor") { status } }', { id: ctr.id });
    ok(cancel.data?.data?.cancelContract?.status === 'CANCELADO', '   contrato anulado');
    const cancel2 = await gql(legal, 'mutation($id: ID!) { cancelContract(id: $id, reason: "Prueba de regresión del refactor") { status } }', { id: ctr.id });
    ok(/ya está anulado/.test(JSON.stringify(cancel2.data)), '   regla de dominio: no se anula dos veces', cancel2.data?.errors?.[0]?.message);
  }

  // 5) Cancelación con reembolso (Clean + Hexagonal + DDD)
  const c1 = await call(juan, 'POST', `/reservations/${reservation.reservationId}/cancel`, { reason: 'Prueba de regresión del refactor' });
  ok(c1.status === 200 && c1.data?.data?.refunded && c1.data?.data?.contractCancelled && c1.data?.data?.propertyReleased, '5. CU15: reembolso + pre-contrato cerrado + inmueble liberado', c1.data?.message);
  await sleep(300);
  ok((await call(juan, 'GET', `/properties/${prop.code}`)).data.status === 'DISPONIBLE', '   DDD: el inmueble volvió a DISPONIBLE');
  const arrasAfter = list(await call(admin, 'GET', '/contracts')).find((c) => c.contractNumber === reservation.contractNumber);
  // Si el contrato definitivo llegó a firmarse, el pre-contrato ya quedó CONCLUIDO y no se vuelve a tocar.
  ok(['CANCELADO', 'CONCLUIDO'].includes(arrasAfter?.status), '   Hexagonal: pre-contrato cerrado (no queda activo)', arrasAfter?.status);
  const charge = (list({ data: (await call(admin, 'GET', '/finances')).data?.data?.payments || [] })).find((p) => p.id === reservation.paymentId);
  ok(charge?.status === 'REFUNDED', '   Clean: cobro de arras REFUNDED en DynamoDB', reservation.paymentId);
  const c2 = await call(juan, 'POST', `/reservations/${reservation.reservationId}/cancel`, { reason: 'otra vez' });
  ok(c2.status === 409, '   Clean: cancelar dos veces → 409', c2.data?.message);

  // Eventos de dominio publicados por el agregado
  const arch = list(await call(admin, 'GET', '/architecture'));
  const events = (arch.find((s) => s.service === 'ms-properties')?.recentDomainEvents || []).filter((e) => e.propertyCode === prop.code).map((e) => e.name);
  ok(['PropertyReservationLocked', 'PropertyReserved', 'PropertyReleased'].every((n) => events.includes(n)), '6. Eventos de dominio publicados', events.reverse().join(' → '));

  console.log(failures ? `\n${failures} verificación(es) fallaron.` : '\nTodos los flujos OK.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
