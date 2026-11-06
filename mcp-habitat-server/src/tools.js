/**
 * Herramientas MCP de Habitat Pro (CU20 reportes y CU21 agente monitor).
 *
 * Seguridad (requisito del docente: nada de SQL por voz):
 *  - Todas son de SOLO LECTURA y llaman al API Gateway con consultas fijas.
 *  - Los parámetros están validados (enums, números, fechas); el modelo nunca arma una consulta libre.
 *  - Se usa el token del usuario que pide el reporte: cada microservicio aplica sus permisos por rol.
 */
const z = require('zod/v4');

const API_URL = (process.env.HABITAT_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const MAX_ROWS = 100;

const PROPERTY_STATUS = ['DISPONIBLE', 'RESERVADO', 'COMPRADO', 'ALQUILADO'];
const PROPERTY_TYPES = ['DEPARTAMENTO', 'CASA', 'TERRENO', 'OFICINA', 'LOCAL_COMERCIAL'];
const CONTRACT_STATUS = ['PENDIENTE_FIRMA', 'FIRMADO', 'CANCELADO', 'CONCLUIDO'];
const CONTRACT_TYPES = ['PROMESA_COMPRAVENTA', 'ARRENDAMIENTO', 'RESERVA_CON_ARRAS'];
const VISIT_STATUS = ['CONFIRMADA', 'COMPLETADA', 'CANCELADA'];
const RESERVATION_STATUS = ['ACTIVA', 'CANCELADA_REEMBOLSADA', 'COMPRADA', 'ALQUILADA'];
const COMMISSION_STATUS = ['PENDIENTE_PAGO', 'PAGADA'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

class ToolError extends Error {}

// GET al gateway con el token del usuario; devuelve el arreglo de datos.
async function apiGet(path, authorization) {
  const res = await fetch(`${API_URL}${path}`, { headers: authorization ? { Authorization: authorization } : {} });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new ToolError('Sesión inválida o expirada.');
  if (res.status === 403) throw new ToolError('El rol del usuario no tiene acceso a estos datos.');
  if (!res.ok || body.success === false) throw new ToolError(body.message || `El servicio respondió HTTP ${res.status}`);
  return body.data !== undefined ? body.data : body;
}

const text = (s) => String(s ?? '').toLowerCase();
const statusOf = (s) => (String(s || '').startsWith('RESERVADO') ? 'RESERVADO' : s);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hoursUntil = (iso) => (iso ? Math.round((new Date(iso).getTime() - Date.now()) / 36e5) : null);
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null);

// Resultado compacto: total, filas (máx. 100) y si se recortó.
function rows(list, extra = {}) {
  return { total: list.length, recortado: list.length > MAX_ROWS, filas: list.slice(0, MAX_ROWS), ...extra };
}

const TOOLS = [
  {
    name: 'consultar_inmuebles',
    description: 'Lista inmuebles del catálogo con filtros opcionales (ciudad, zona, estado, tipo, rango de precio en USD, dormitorios mínimos). Devuelve código, título, tipo, ubicación, precio, estado y asesor.',
    inputSchema: {
      ciudad: z.string().max(60).optional().describe('Ciudad, ej. "Santa Cruz" (coincidencia parcial)'),
      zona: z.string().max(60).optional().describe('Zona o barrio, ej. "Equipetrol" (coincidencia parcial)'),
      estado: z.enum(PROPERTY_STATUS).optional(),
      tipo: z.enum(PROPERTY_TYPES).optional(),
      precio_min: z.number().nonnegative().optional(),
      precio_max: z.number().positive().optional(),
      dormitorios_min: z.number().int().nonnegative().optional(),
    },
    async run(args, auth) {
      const list = (await apiGet('/properties', auth))
        .filter((p) => !args.ciudad || text(p.city).includes(text(args.ciudad)))
        .filter((p) => !args.zona || text(p.zone).includes(text(args.zona)))
        .filter((p) => !args.estado || statusOf(p.status) === args.estado)
        .filter((p) => !args.tipo || p.propertyType === args.tipo)
        .filter((p) => args.precio_min === undefined || p.price >= args.precio_min)
        .filter((p) => args.precio_max === undefined || p.price <= args.precio_max)
        .filter((p) => args.dormitorios_min === undefined || (p.rooms || 0) >= args.dormitorios_min)
        .map((p) => ({
          codigo: p.code, titulo: p.title, tipo: p.propertyType, ciudad: p.city, zona: p.zone,
          precio_usd: p.price, estado: statusOf(p.status), dormitorios: p.rooms || 0, banos: p.bathrooms || 0,
          superficie_m2: p.areaSquareMeters || 0, asesor: p.brokerName,
        }));
      return rows(list);
    },
  },
  {
    name: 'resumen_cartera',
    description: 'Totales del catálogo: cantidad de inmuebles por estado y por ciudad, y valor total publicado en USD.',
    inputSchema: {},
    async run(_args, auth) {
      const list = await apiGet('/properties', auth);
      const porEstado = {};
      const porCiudad = {};
      for (const p of list) {
        porEstado[statusOf(p.status)] = (porEstado[statusOf(p.status)] || 0) + 1;
        porCiudad[p.city || 'Sin ciudad'] = (porCiudad[p.city || 'Sin ciudad'] || 0) + 1;
      }
      const filas = Object.entries(porCiudad).map(([ciudad, cantidad]) => ({
        ciudad,
        inmuebles: cantidad,
        valor_usd: round2(list.filter((p) => (p.city || 'Sin ciudad') === ciudad).reduce((s, p) => s + (p.price || 0), 0)),
      }));
      return rows(filas, { total_inmuebles: list.length, por_estado: porEstado, valor_total_usd: round2(list.reduce((s, p) => s + (p.price || 0), 0)) });
    },
  },
  {
    name: 'consultar_contratos',
    description: 'Lista contratos (compraventa, arrendamiento o pre-contrato de arras) con filtros opcionales de estado y tipo.',
    inputSchema: {
      estado: z.enum(CONTRACT_STATUS).optional(),
      tipo: z.enum(CONTRACT_TYPES).optional(),
    },
    async run(args, auth) {
      const list = (await apiGet('/contracts', auth))
        .filter((c) => !args.estado || c.status === args.estado)
        .filter((c) => !args.tipo || c.contractType === args.tipo)
        .map((c) => ({
          numero: c.contractNumber, tipo: c.contractType, estado: c.status, inmueble: c.propertyTitle || c.propertyId,
          cliente: c.userName || c.clientId, monto_usd: Number(c.totalAmount) || 0, anticipo_usd: Number(c.downPayment) || 0,
          firmas: (c.signatures || []).length, fecha: String(c.createdAt || '').slice(0, 10), dias_desde_creacion: daysSince(c.createdAt),
        }));
      return rows(list);
    },
  },
  {
    name: 'consultar_visitas',
    description: 'Lista visitas agendadas a inmuebles, con filtros opcionales por rango de fechas (AAAA-MM-DD) y estado.',
    inputSchema: {
      desde: date.optional(),
      hasta: date.optional(),
      estado: z.enum(VISIT_STATUS).optional(),
    },
    async run(args, auth) {
      const list = (await apiGet('/appointments', auth))
        .filter((a) => !args.desde || a.visitDate >= args.desde)
        .filter((a) => !args.hasta || a.visitDate <= args.hasta)
        .filter((a) => !args.estado || a.status === args.estado)
        .sort((a, b) => `${a.visitDate} ${a.visitTime}`.localeCompare(`${b.visitDate} ${b.visitTime}`))
        .map((a) => ({
          id: a.id, fecha: a.visitDate, hora: a.visitTime, inmueble: a.propertyTitle || a.propertyId,
          ciudad: a.city || '', cliente: a.clientName || a.userName, telefono: a.clientPhone || a.userPhone || '',
          modalidad: a.visitType, estado: a.status,
        }));
      return rows(list);
    },
  },
  {
    name: 'consultar_reservas',
    description: 'Lista reservas con arras (el inmueble queda apartado 48 h), con filtro opcional de estado.',
    inputSchema: { estado: z.enum(RESERVATION_STATUS).optional() },
    async run(args, auth) {
      const list = (await apiGet('/reservations', auth))
        .filter((r) => !args.estado || r.status === args.estado)
        .map((r) => ({
          id: r.reservationId || r.id, inmueble: r.propertyTitle || r.propertyId, titular: r.userName || r.user_name,
          telefono: r.userPhone || r.user_phone || '', arras_usd: Number(r.depositAmount || r.deposit_amount) || 0,
          estado: r.status, creada: String(r.created_at || '').slice(0, 10), vence: String(r.expires_at || '').slice(0, 16).replace('T', ' '),
          horas_para_vencer: r.status === 'ACTIVA' ? hoursUntil(r.expires_at) : null,
        }));
      return rows(list);
    },
  },
  {
    name: 'resumen_financiero',
    description: 'Totales de caja: ingresos, saldos de compra, cuotas de alquiler, arras en custodia, reembolsos y comisiones (pagadas y pendientes), más los últimos movimientos. Solo Cajero y Administrador.',
    inputSchema: {},
    async run(_args, auth) {
      const f = await apiGet('/finances', auth);
      const movimientos = (f.payments || []).slice(0, 30).map((p) => ({
        id: p.id, concepto: p.concept, cliente: p.clientName || '', monto_usd: p.amount, metodo: p.method, estado: p.status, fecha: String(p.created_at || '').slice(0, 10),
      }));
      return rows(movimientos, {
        totales: {
          ingresos_usd: f.totalVolume, saldos_compra_usd: f.totalSales, cuotas_alquiler_usd: f.totalRent, arras_custodia_usd: f.totalArras,
          reembolsado_usd: f.totalRefunded, comisiones_usd: f.totalCommissions, comisiones_pendientes_usd: f.pendingCommissions, comisiones_pagadas_usd: f.paidCommissions,
        },
      });
    },
  },
  {
    name: 'consultar_comisiones',
    description: 'Lista comisiones de agentes (3% de cada operación menos 13% de retención) con filtro opcional de estado. Solo Cajero y Administrador.',
    inputSchema: { estado: z.enum(COMMISSION_STATUS).optional() },
    async run(args, auth) {
      const list = (await apiGet('/commissions', auth))
        .filter((c) => !args.estado || c.status === args.estado)
        .map((c) => ({
          id: c.commissionId, agente: c.agentName || c.agentId, contrato: c.contractNumber || '', operacion: c.operationType,
          base_usd: c.baseAmount, neto_usd: c.netAmount, estado: c.status, pagada: String(c.paidAt || '').slice(0, 10),
          dias_desde_generada: daysSince(c.createdAt),
        }));
      return rows(list);
    },
  },
  {
    name: 'consultar_consultas_clientes',
    description: 'Lista las consultas que los clientes enviaron sobre inmuebles, con filtro opcional de estado y cuántas horas lleva cada una sin respuesta.',
    inputSchema: { estado: z.enum(['PENDIENTE', 'RESPONDIDA']).optional() },
    async run(args, auth) {
      const list = (await apiGet('/inquiries', auth))
        .filter((q) => !args.estado || q.status === args.estado)
        .map((q) => ({
          id: q.id, inmueble: q.propertyTitle || q.propertyId, cliente: q.clientName, telefono: q.clientPhone || '',
          consulta: String(q.message || '').slice(0, 140), estado: q.status, creada: String(q.createdAt || '').slice(0, 16).replace('T', ' '),
          horas_sin_respuesta: q.status === 'PENDIENTE' ? -hoursUntil(q.createdAt) : null, respondida_por: q.answeredBy || '',
        }));
      return rows(list);
    },
  },
  {
    name: 'consultar_cobros_pendientes',
    description: 'Contratos firmados con cobros pendientes en caja: saldos de compra sin pagar y cuotas de alquiler (indica si la cuota del mes está atrasada). Solo Cajero y Administrador.',
    inputSchema: {},
    async run(_args, auth) {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const list = (await apiGet('/cashier/operations', auth))
        .filter((o) => !o.settled)
        .map((o) => {
          const rent = o.kind === 'CUOTA_ALQUILER';
          const late = rent && (o.nextPeriod < thisMonth || (o.nextPeriod === thisMonth && now.getDate() > 5));
          return {
            contrato: o.contractNumber, tipo: rent ? 'Cuota de alquiler' : 'Saldo de compra', cliente: o.clientName,
            inmueble: o.propertyTitle || o.propertyId, monto_usd: o.amountDue, periodo: rent ? o.nextPeriod : null,
            atrasado: late, firmado: String(o.signedAt || '').slice(0, 10), dias_desde_firma: daysSince(o.signedAt),
          };
        });
      return rows(list);
    },
  },
  {
    name: 'resumen_negocio',
    description: 'Resumen consolidado de todo el negocio en una sola llamada (cruza inmuebles, visitas, reservas, contratos, cobros y comisiones): indicadores clave (ingresos del mes y variación contra el mes anterior, valor de la cartera, arras en custodia, comisiones por pagar, días promedio de cierre), embudo de 90 días visitas → reservas → contratos firmados y pendientes que requieren atención. Úsala PRIMERO para preguntas de totales, tendencias, conversión o desempeño de agentes. El parámetro vista elige qué tabla devuelve en filas. Solo Cajero y Administrador.',
    inputSchema: {
      vista: z.enum(['ingresos_por_mes', 'embudo', 'agentes', 'ciudades', 'pendientes']).optional().describe('Tabla a devolver (por defecto ingresos_por_mes de los últimos 6 meses)'),
    },
    async run(args, auth) {
      const o = await apiGet('/bi/overview', auth);
      const tables = {
        ingresos_por_mes: () => o.ingresosPorMes.map((m) => ({ mes: m.mes, arras_usd: m.arras, saldos_compra_usd: m.saldos, cuotas_alquiler_usd: m.cuotas, total_usd: m.total })),
        embudo: () => o.embudo.etapas.map((e) => ({ etapa: e.etapa, cantidad: e.cantidad, conversion_pct: e.conversion })),
        agentes: () => o.agentes.map((a) => ({ agente: a.agente, operaciones: a.operaciones, monto_vendido_usd: a.montoVendido, comision_usd: a.comision, comision_pendiente_usd: a.comisionPendiente })),
        ciudades: () => o.cartera.porCiudad.map((c) => ({ ciudad: c.ciudad, inmuebles: c.inmuebles, disponibles: c.disponibles, valor_usd: c.valor })),
        pendientes: () => o.pendientes,
      };
      const k = o.kpis;
      return rows(tables[args.vista || 'ingresos_por_mes'](), {
        indicadores: {
          inmuebles: k.inmuebles, disponibles: k.disponibles, reservados: k.reservados, vendidos: k.vendidos, alquilados: k.alquilados,
          valor_cartera_usd: k.valorCartera, ingresos_mes_usd: k.ingresosMes, ingresos_mes_anterior_usd: k.ingresosMesAnterior,
          variacion_mes_pct: k.variacionMes, arras_custodia_usd: k.arrasCustodia, comisiones_por_pagar_usd: k.comisionesPorPagar,
          dias_promedio_cierre: k.diasPromedioCierre,
        },
        embudo_90_dias: o.embudo.etapas,
        cantidad_pendientes: o.pendientes.length,
      });
    },
  },
];

module.exports = { TOOLS, ToolError };
