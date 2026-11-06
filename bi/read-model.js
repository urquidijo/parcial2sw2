/**
 * Modelo de lectura consolidado (CU19 dashboard, CU20 reportes, CU21 monitor).
 *
 * Lado de lectura de CQRS: cruza en un solo resumen lo que vive en 3 bases distintas
 * (inmuebles y consultas en MongoDB, visitas y contratos en PostgreSQL, cobros, reservas y
 * comisiones en DynamoDB). Es una función pura: recibe las listas ya leídas y no toca ninguna base.
 */
const DAY = 864e5;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : null);
// En el embudo una etapa no puede convertir más del 100 % (pasa si hubo reservas sin visita registrada).
const conversion = (part, total) => (total > 0 && part <= total ? pct(part, total) : null);
const time = (iso) => (iso ? new Date(iso).getTime() : NaN);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const statusOf = (s) => (String(s || '').startsWith('RESERVADO') ? 'RESERVADO' : String(s || 'SIN_ESTADO'));

const PROPERTY_STATUS = ['DISPONIBLE', 'RESERVADO', 'COMPRADO', 'ALQUILADO'];
const INCOME_KINDS = { ARRAS: 'arras', SALDO_COMPRA: 'saldos', CUOTA_ALQUILER: 'cuotas' };
const MONTHS_BACK = 6;
const FUNNEL_DAYS = 90;

/**
 * @param {object} data   listas por fuente; una fuente en `null` significa que el servicio no respondió
 * @param {number} now    marca de tiempo (inyectable para pruebas)
 */
function buildOverview(data, now = Date.now()) {
  const list = (x) => (Array.isArray(x) ? x : []);
  const properties = list(data.properties);
  const appointments = list(data.appointments);
  const reservations = list(data.reservations);
  const contracts = list(data.contracts);
  const payments = list(data.payments);
  const commissions = list(data.commissions);
  const inquiries = list(data.inquiries);

  const fuentes = {
    inmuebles: data.properties != null,
    visitas: data.appointments != null,
    reservas: data.reservations != null,
    contratos: data.contracts != null,
    cobros: data.payments != null,
    comisiones: data.commissions != null,
    consultas: data.inquiries != null,
  };

  // ---- Cartera (inmuebles) ----
  const porEstado = Object.fromEntries(PROPERTY_STATUS.map((s) => [s, 0]));
  const ciudades = new Map();
  let valorCartera = 0;
  for (const p of properties) {
    const st = statusOf(p.status);
    porEstado[st] = (porEstado[st] || 0) + 1;
    const price = Number(p.price) || 0;
    valorCartera += price;
    const c = ciudades.get(p.city || 'Sin ciudad') || { ciudad: p.city || 'Sin ciudad', inmuebles: 0, disponibles: 0, valor: 0 };
    c.inmuebles += 1;
    if (st === 'DISPONIBLE') c.disponibles += 1;
    c.valor += price;
    ciudades.set(c.ciudad, c);
  }
  const porCiudad = [...ciudades.values()]
    .map((c) => ({ ...c, valor: round2(c.valor) }))
    .sort((a, b) => b.inmuebles - a.inmuebles);

  // ---- Ingresos por mes (solo cobros pagados) ----
  const nowDate = new Date(now);
  const meses = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i -= 1) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
    meses.push({ mes: monthKey(d), arras: 0, saldos: 0, cuotas: 0, total: 0 });
  }
  const byMonth = new Map(meses.map((m) => [m.mes, m]));
  let arrasCustodia = 0;
  for (const p of payments) {
    if (p.status !== 'PAID') continue;
    const field = INCOME_KINDS[p.kind];
    if (!field) continue;
    const amount = Number(p.amount) || 0;
    if (p.kind === 'ARRAS') arrasCustodia += amount;
    const t = time(p.created_at);
    if (Number.isNaN(t)) continue;
    const m = byMonth.get(monthKey(new Date(t)));
    if (!m) continue;
    m[field] += amount;
    m.total += amount;
  }
  for (const m of meses) for (const k of ['arras', 'saldos', 'cuotas', 'total']) m[k] = round2(m[k]);
  const esteMes = meses[meses.length - 1].total;
  const mesAnterior = meses[meses.length - 2].total;

  // ---- Embudo de los últimos 90 días ----
  // Cada reserva genera un pre-contrato de arras en PostgreSQL (también las anteriores a la saga, que no
  // están en DynamoDB): se cuentan esos pre-contratos, o las reservas si no hay datos de contratos.
  const since = now - FUNNEL_DAYS * DAY;
  const inWindow = (iso) => time(iso) >= since;
  const arrasContracts = contracts.filter((c) => c.contractType === 'RESERVA_CON_ARRAS');
  const operations = contracts.filter((c) => c.contractType !== 'RESERVA_CON_ARRAS');
  // Fecha de firma: la última firma registrada (updatedAt también cambia al cancelar).
  const signedAt = (c) => {
    const sigs = (c.signatures || []).map((s) => time(s.signedAt)).filter((t) => !Number.isNaN(t));
    return sigs.length ? Math.max(...sigs) : time(c.updatedAt || c.createdAt);
  };
  const visitas = appointments.filter((a) => a.status !== 'CANCELADA' && inWindow(a.createdAt || a.visitDate)).length;
  const reservasN = data.contracts != null
    ? arrasContracts.filter((c) => inWindow(c.createdAt)).length
    : reservations.filter((r) => inWindow(r.created_at)).length;
  const firmados = operations.filter((c) => c.status === 'FIRMADO' && signedAt(c) >= since).length;
  const embudo = {
    dias: FUNNEL_DAYS,
    etapas: [
      { etapa: 'Visitas', cantidad: visitas, conversion: null },
      { etapa: 'Reservas', cantidad: reservasN, conversion: conversion(reservasN, visitas) },
      { etapa: 'Contratos firmados', cantidad: firmados, conversion: conversion(firmados, reservasN) },
    ],
  };

  // ---- Tiempo medio de cierre: de la reserva a la firma del contrato del mismo inmueble ----
  const firstReservation = new Map();
  const markReservation = (propertyId, iso) => {
    const t = time(iso);
    const key = String(propertyId);
    if (!Number.isNaN(t) && (!firstReservation.has(key) || t < firstReservation.get(key))) firstReservation.set(key, t);
  };
  for (const r of reservations) markReservation(r.propertyId, r.created_at);
  for (const c of arrasContracts) markReservation(c.propertyId, c.createdAt);
  const closeDays = operations
    .filter((c) => c.status === 'FIRMADO' && firstReservation.has(String(c.propertyId)))
    .map((c) => (signedAt(c) - firstReservation.get(String(c.propertyId))) / DAY)
    .filter((d) => Number.isFinite(d) && d >= 0);
  const diasCierre = closeDays.length ? Math.round((closeDays.reduce((s, d) => s + d, 0) / closeDays.length) * 10) / 10 : null;

  // ---- Agentes: operaciones cerradas y comisión generada ----
  const agents = new Map();
  const agent = (id, name) => {
    const key = String(id || name || 'sin-asignar');
    if (!agents.has(key)) agents.set(key, { agente: name || key, operaciones: 0, montoVendido: 0, comision: 0, comisionPendiente: 0 });
    const a = agents.get(key);
    if (name && a.agente === key) a.agente = name;
    return a;
  };
  for (const c of commissions) {
    const a = agent(c.agentId, c.agentName);
    a.operaciones += 1;
    a.montoVendido += Number(c.baseAmount) || 0;
    a.comision += Number(c.netAmount) || 0;
    if (c.status === 'PENDIENTE_PAGO') a.comisionPendiente += Number(c.netAmount) || 0;
  }
  const agentes = [...agents.values()]
    .map((a) => ({ ...a, montoVendido: round2(a.montoVendido), comision: round2(a.comision), comisionPendiente: round2(a.comisionPendiente) }))
    .sort((a, b) => b.montoVendido - a.montoVendido)
    .slice(0, 5);
  const comisionesPorPagar = round2(commissions.filter((c) => c.status === 'PENDIENTE_PAGO').reduce((s, c) => s + (Number(c.netAmount) || 0), 0));

  // ---- Requiere atención (mismos criterios que el monitor CU21) ----
  const pendientes = [];
  for (const r of reservations) {
    if (r.status !== 'ACTIVA') continue;
    const h = Math.round((time(r.expires_at) - now) / 36e5);
    if (Number.isFinite(h) && h < 24) {
      pendientes.push({ tipo: 'Reserva por vencer', prioridad: 'alta', detalle: `${r.propertyTitle || r.propertyId} · ${r.userName || r.user_name || 'cliente'}`, horas: h });
    }
  }
  for (const c of contracts) {
    if (c.status !== 'PENDIENTE_FIRMA') continue;
    const d = Math.floor((now - time(c.createdAt)) / DAY);
    if (d > 7) pendientes.push({ tipo: 'Contrato sin firmar', prioridad: 'media', detalle: `${c.contractNumber || ''} · ${c.propertyTitle || c.propertyId}`, dias: d });
  }
  for (const q of inquiries) {
    if (q.status !== 'PENDIENTE') continue;
    const h = Math.floor((now - time(q.createdAt)) / 36e5);
    if (h > 48) pendientes.push({ tipo: 'Consulta sin responder', prioridad: 'alta', detalle: `${q.propertyTitle || q.propertyId} · ${q.clientName || 'cliente'}`, horas: h });
  }
  const order = { alta: 0, media: 1, baja: 2 };
  pendientes.sort((a, b) => order[a.prioridad] - order[b.prioridad]);

  return {
    generadoEn: new Date(now).toISOString(),
    fuentes,
    kpis: {
      inmuebles: properties.length,
      disponibles: porEstado.DISPONIBLE || 0,
      reservados: porEstado.RESERVADO || 0,
      vendidos: porEstado.COMPRADO || 0,
      alquilados: porEstado.ALQUILADO || 0,
      valorCartera: round2(valorCartera),
      ingresosMes: esteMes,
      ingresosMesAnterior: mesAnterior,
      variacionMes: mesAnterior > 0 ? Math.round(((esteMes - mesAnterior) / mesAnterior) * 1000) / 10 : null,
      arrasCustodia: round2(arrasCustodia),
      comisionesPorPagar,
      diasPromedioCierre: diasCierre,
    },
    embudo,
    ingresosPorMes: meses,
    cartera: { porEstado, porCiudad },
    agentes,
    pendientes: pendientes.slice(0, 20),
  };
}

module.exports = { buildOverview };
