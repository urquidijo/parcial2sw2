import React, { useEffect, useState, useCallback } from 'react';

const KEYCLOAK_CONFIG = {
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
  realm: 'habitat',
  clientId: 'habitat-web',
};
const SHELL_URL = process.env.NEXT_PUBLIC_SHELL_URL || 'http://localhost:5000';

function resolveApiUrl() {
  if (typeof window !== 'undefined') {
    if (window.API_URL) return window.API_URL.replace(/\/$/, '');
    if (window.location.origin.includes('vercel.app')) {
      return 'https://api-gateway-production-c3ed.up.railway.app/api';
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
}

// Instancia única: si ya hay sesión de Keycloak abierta en otra app (ERP, móvil), entra sin pedir contraseña.
let keycloakPromise = null;
function initKeycloak() {
  if (!keycloakPromise) {
    keycloakPromise = import('keycloak-js').then(async ({ default: Keycloak }) => {
      const keycloak = new Keycloak(KEYCLOAK_CONFIG);
      await keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false });
      return keycloak;
    });
  }
  return keycloakPromise;
}

function canSeeFinances(token) {
  const roles = token?.realm_access?.roles || [];
  return roles.includes('ADMIN') || (roles.includes('EMPLEADO') && token.sector === 'FINANZAS');
}

const KIND_LABELS = { ARRAS: 'Arras de reserva', SALDO_COMPRA: 'Saldo de compra', CUOTA_ALQUILER: 'Cuota de alquiler' };

function Notice({ title, text, children }) {
  return (
    <div className="card" style={{ maxWidth: '480px', margin: '4rem auto', padding: '1.5rem', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>{title}</h2>
      <p className="muted" style={{ fontSize: '0.86rem' }}>{text}</p>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub ? <span className="sub">{sub}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resumen consolidado (CU19): datos de GET /api/bi/overview
// ---------------------------------------------------------------------------
// Paleta validada (dataviz validate_palette, modo claro): orden fijo, cada serie conserva su color.
const SERIES = [
  { key: 'saldos', label: 'Saldos de compra', color: '#1d4ed8' },
  { key: 'cuotas', label: 'Cuotas de alquiler', color: '#eb6834' },
  { key: 'arras', label: 'Arras de reserva', color: '#1baf7a' },
];
const STATUS_LABELS = { DISPONIBLE: 'Disponibles', RESERVADO: 'Reservados', COMPRADO: 'Vendidos', ALQUILADO: 'Alquilados' };
const SOURCE_LABELS = { inmuebles: 'inmuebles', visitas: 'visitas', reservas: 'reservas', contratos: 'contratos', cobros: 'cobros', comisiones: 'comisiones', consultas: 'consultas de clientes' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`; };
const usd = (v) => `$${Number(v || 0).toLocaleString('es-BO', { maximumFractionDigits: 0 })}`;
const compactUsd = (v) => (v >= 1e6 ? `$${(v / 1e6).toLocaleString('es-BO', { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `$${Math.round(v / 1e3)} mil` : usd(v));

function Section({ title, sub, action, children }) {
  return (
    <section className="card" style={{ minWidth: 0 }}>
      <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '0.95rem' }}>{title}</h2>
          {sub ? <p className="muted" style={{ fontSize: '0.76rem' }}>{sub}</p> : null}
        </div>
        {action}
      </div>
      <div style={{ padding: '1rem' }}>{children}</div>
    </section>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
      {SERIES.map((s) => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />{s.label}
        </span>
      ))}
    </div>
  );
}

// Barras apiladas de ingresos por mes: un eje, marcas finas, 2 px de separación entre segmentos y tooltip al pasar.
function IncomeChart({ months }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 220, padL = 56, padB = 26, padT = 10;
  const max = Math.max(...months.map((m) => m.total), 1);
  const step = (() => { const raw = max / 4; const p = 10 ** Math.floor(Math.log10(raw)); return Math.ceil(raw / p) * p; })();
  const top = step * 4;
  const plotH = H - padB - padT;
  const slot = (W - padL) / months.length;
  const barW = Math.min(44, slot * 0.55);
  const y = (v) => padT + plotH - (v / top) * plotH;

  return (
    <div style={{ position: 'relative' }}>
      <Legend />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Ingresos por mes de los últimos 6 meses">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={padL} x2={W} y1={y(step * i)} y2={y(step * i)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 8} y={y(step * i) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{compactUsd(step * i)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = padL + slot * i + (slot - barW) / 2;
          let acc = 0;
          const segs = SERIES.filter((s) => m[s.key] > 0);
          return (
            <g key={m.mes} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill={hover === i ? 'var(--bg-alt)' : 'transparent'} />
              {segs.map((s, j) => {
                const h = (m[s.key] / top) * plotH;
                const yTop = y(acc + m[s.key]);
                acc += m[s.key];
                const isTop = j === segs.length - 1;
                const gap = j > 0 ? 2 : 0;
                return (
                  <path key={s.key} fill={s.color}
                    d={isTop
                      ? `M${x},${yTop + h - gap} V${yTop + 4} Q${x},${yTop} ${x + 4},${yTop} H${x + barW - 4} Q${x + barW},${yTop} ${x + barW},${yTop + 4} V${yTop + h - gap} Z`
                      : `M${x},${yTop + h - gap} V${yTop} H${x + barW} V${yTop + h - gap} Z`} />
                );
              })}
              <text x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{monthLabel(m.mes)}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null ? (
        <div style={{ position: 'absolute', top: 30, left: `${Math.min(70, ((padL + slot * hover + slot) / W) * 100)}%`, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)', padding: '0.5rem 0.65rem', fontSize: '0.76rem', pointerEvents: 'none', minWidth: 170 }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{monthLabel(months[hover].mes)}</div>
          {SERIES.map((s) => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{s.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(months[hover][s.key])}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: '0.3rem', paddingTop: '0.3rem', fontWeight: 600 }}>
            <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(months[hover].total)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IncomeTable({ months }) {
  return (
    <table className="data-table">
      <thead><tr><th>Mes</th>{SERIES.map((s) => <th key={s.key} style={{ textAlign: 'right' }}>{s.label}</th>)}<th style={{ textAlign: 'right' }}>Total</th></tr></thead>
      <tbody>
        {months.map((m) => (
          <tr key={m.mes}>
            <td>{monthLabel(m.mes)}</td>
            {SERIES.map((s) => <td key={s.key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(m[s.key])}</td>)}
            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{usd(m.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Barra horizontal de una sola serie (magnitud): se usa en el embudo y en la cartera.
function HBar({ label, value, max, right }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 140px) 1fr auto', alignItems: 'center', gap: '0.75rem', fontSize: '0.82rem' }}>
      <span>{label}</span>
      <div style={{ height: 10, background: 'var(--bg-alt)', borderRadius: 4 }}>
        <div style={{ width: `${max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0}%`, height: '100%', background: 'var(--brand)', borderRadius: 4 }} />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 72, textAlign: 'right' }}>{right}</span>
    </div>
  );
}

function secondsAgo(iso, now) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
}

function Overview({ data, money }) {
  const [asTable, setAsTable] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(t); }, []);
  const k = data.kpis;
  const missing = Object.entries(data.fuentes || {}).filter(([, ok]) => !ok).map(([s]) => SOURCE_LABELS[s] || s);
  const variation = k.variacionMes === null ? 'Sin ingresos el mes anterior' : `${k.variacionMes > 0 ? '+' : ''}${k.variacionMes.toLocaleString('es-BO')} % vs. mes anterior`;
  const funnelMax = Math.max(...data.embudo.etapas.map((e) => e.cantidad), 1);
  const estados = Object.entries(data.cartera.porEstado);
  const estadoMax = Math.max(...estados.map(([, n]) => n), 1);

  return (
    <>
      {missing.length ? (
        <div className="card" style={{ padding: '0.65rem 1rem', fontSize: '0.82rem', borderColor: '#fde68a', background: 'var(--amber-light)', color: 'var(--amber)' }}>
          Algunos datos no están disponibles en este momento o para tu rol: {missing.join(', ')}. El resto del resumen está completo.
        </div>
      ) : null}

      <div className="stat-strip">
        <Stat label="Ingresos del mes" value={money(k.ingresosMes)} sub={variation} />
        <Stat label="Valor de la cartera" value={money(k.valorCartera)} sub={`${k.inmuebles} inmuebles · ${k.disponibles} disponibles`} />
        <Stat label="Arras en custodia" value={money(k.arrasCustodia)} sub="Cobradas como seña de reserva" />
        <Stat label="Comisiones por pagar" value={money(k.comisionesPorPagar)} sub="A los agentes" />
        <Stat label="Tiempo de cierre" value={k.diasPromedioCierre === null ? '—' : `${k.diasPromedioCierre.toLocaleString('es-BO')} días`} sub="De la reserva a la firma" />
      </div>

      <Section title="Ingresos por mes" sub="Cobros registrados en caja, últimos 6 meses"
        action={<button className="btn btn-secondary" onClick={() => setAsTable((v) => !v)}>{asTable ? 'Ver gráfico' : 'Ver como tabla'}</button>}>
        {asTable ? <IncomeTable months={data.ingresosPorMes} /> : <IncomeChart months={data.ingresosPorMes} />}
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <Section title="Embudo comercial" sub={`Últimos ${data.embudo.dias} días`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {data.embudo.etapas.map((e) => (
              <HBar key={e.etapa} label={e.etapa} value={e.cantidad} max={funnelMax}
                right={<>{e.cantidad}{e.conversion !== null ? <span className="muted" style={{ fontSize: '0.74rem' }}> · {e.conversion.toLocaleString('es-BO')} %</span> : null}</>} />
            ))}
          </div>
          <p className="muted" style={{ fontSize: '0.74rem', marginTop: '0.8rem' }}>El porcentaje es la conversión desde la etapa anterior. No se muestra si hubo reservas sin visita registrada.</p>
        </Section>

        <Section title="Cartera por estado" sub={`${k.inmuebles} inmuebles publicados`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {estados.map(([st, n]) => <HBar key={st} label={STATUS_LABELS[st] || st} value={n} max={estadoMax} right={n} />)}
          </div>
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <section className="card" style={{ overflowX: 'auto' }}>
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}><h2 style={{ fontSize: '0.95rem' }}>Cartera por ciudad</h2></div>
          <table className="data-table">
            <thead><tr><th>Ciudad</th><th style={{ textAlign: 'right' }}>Inmuebles</th><th style={{ textAlign: 'right' }}>Disponibles</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
            <tbody>
              {data.cartera.porCiudad.length === 0 ? <tr><td colSpan={4} className="muted">Sin inmuebles.</td></tr> : data.cartera.porCiudad.map((c) => (
                <tr key={c.ciudad}><td>{c.ciudad}</td><td style={{ textAlign: 'right' }}>{c.inmuebles}</td><td style={{ textAlign: 'right' }}>{c.disponibles}</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(c.valor)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card" style={{ overflowX: 'auto' }}>
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}><h2 style={{ fontSize: '0.95rem' }}>Agentes con más ventas</h2></div>
          <table className="data-table">
            <thead><tr><th>Agente</th><th style={{ textAlign: 'right' }}>Operaciones</th><th style={{ textAlign: 'right' }}>Monto cerrado</th><th style={{ textAlign: 'right' }}>Comisión</th></tr></thead>
            <tbody>
              {data.agentes.length === 0 ? <tr><td colSpan={4} className="muted">Todavía no hay operaciones cerradas.</td></tr> : data.agentes.map((a) => (
                <tr key={a.agente}>
                  <td>{a.agente}</td>
                  <td style={{ textAlign: 'right' }}>{a.operaciones}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(a.montoVendido)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(a.comision)}{a.comisionPendiente > 0 ? <div className="muted" style={{ fontSize: '0.72rem' }}>Por pagar {money(a.comisionPendiente)}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <Section title="Requiere atención" sub="Reservas por vencer, contratos sin firmar y consultas sin responder">
        {data.pendientes.length === 0 ? <p className="muted" style={{ fontSize: '0.84rem' }}>No hay pendientes.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.pendientes.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '0.84rem', flexWrap: 'wrap' }}>
                <span className={`status-pill ${p.prioridad === 'alta' ? 'bad' : 'warn'}`}>{p.prioridad === 'alta' ? 'Alta' : 'Media'}</span>
                <span style={{ fontWeight: 500 }}>{p.tipo}</span>
                <span className="muted">{p.detalle}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.76rem' }}>
                  {p.dias !== undefined ? `${p.dias} días` : p.horas < 0 ? 'vencida' : `${p.horas} h`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <p className="muted" style={{ fontSize: '0.74rem', textAlign: 'right' }}>Actualizado {secondsAgo(data.generadoEn, now)}</p>
    </>
  );
}

export default function BIDashboardPage() {
  const [finances, setFinances] = useState({
    totalVolume: 0,
    totalArras: 0,
    totalCommissions: 0,
    payments: []
  });
  const [overview, setOverview] = useState(null);
  const [tab, setTab] = useState('resumen');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    initKeycloak()
      .then((keycloak) => setSession({
        keycloak,
        name: keycloak.tokenParsed?.name || keycloak.tokenParsed?.email,
        allowed: canSeeFinances(keycloak.tokenParsed),
      }))
      .catch(() => setAuthError(`No se pudo conectar con el servidor de inicio de sesión (Keycloak en ${KEYCLOAK_CONFIG.url}).`));
  }, []);

  const logout = () => session.keycloak.logout({ redirectUri: window.location.origin });

  const loadFinances = useCallback(async (fresh = false) => {
    if (!session?.allowed) return;
    setLoading(true);
    try {
      await session.keycloak.updateToken(30);
      const headers = { Authorization: `Bearer ${session.keycloak.token}` };
      const [finRes, ovRes] = await Promise.all([
        fetch(`${resolveApiUrl()}/finances`, { headers }).then((r) => r.json()).catch(() => null),
        fetch(`${resolveApiUrl()}/bi/overview${fresh ? '?fresh=1' : ''}`, { headers }).then((r) => r.json()).catch(() => null),
      ]);
      if (finRes && finRes.success && finRes.data) setFinances(finRes.data);
      if (ovRes && ovRes.success && ovRes.data) setOverview(ovRes.data);
    } catch (err) {
      console.error('[mfe-bi-next] Error cargando analítica de DynamoDB:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadFinances();
    const handleRefresh = () => loadFinances();
    window.addEventListener('habitat:refresh:finances', handleRefresh);
    return () => window.removeEventListener('habitat:refresh:finances', handleRefresh);
  }, [loadFinances]);

  const formatMoney = (val) => Number(val || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 });
  const money = (val) => `$${formatMoney(val)} USD`;

  if (authError) {
    return <Notice title="Sin conexión con el inicio de sesión" text={authError} />;
  }
  if (!session) {
    return <Notice title="Verificando tu sesión…" text="Conectando con el inicio de sesión." />;
  }
  if (!session.allowed) {
    return (
      <Notice title="Sin acceso al dashboard" text={`${session.name} no tiene permiso: solo el Administrador y el área de Finanzas pueden verlo.`}>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
          <a className="btn btn-secondary" href={SHELL_URL}>Volver al portal</a>
          <button className="btn btn-secondary" onClick={logout}>Cerrar sesión</button>
        </div>
      </Notice>
    );
  }

  return (
    <div>
      {/* Encabezado */}
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.6rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--brand)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: '0.8rem' }}>HP</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.1 }}>Habitat Pro</div>
            <div className="muted" style={{ fontSize: '0.72rem' }}>Dashboard financiero</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.82rem', flexWrap: 'wrap' }}>
          <span className="muted">{session.name}</span>
          <a href={SHELL_URL}>Ir al portal</a>
          <button className="btn btn-secondary" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.2rem' }}>{tab === 'resumen' ? 'Resumen del negocio' : 'Resumen financiero'}</h1>
            <p className="muted" style={{ fontSize: '0.84rem', marginTop: '0.15rem' }}>
              {tab === 'resumen' ? 'Ventas, cartera, embudo comercial y pendientes de todas las áreas.' : 'Ingresos, arras en custodia, comisiones y movimientos de caja.'}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => loadFinances(true)}>Actualizar</button>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)' }}>
          {[['resumen', 'Resumen'], ['libro', 'Libro mayor']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === id ? 'var(--brand)' : 'transparent'}`, color: tab === id ? 'var(--text-main)' : 'var(--text-muted)', fontFamily: 'inherit', fontSize: '0.86rem', fontWeight: 500, padding: '0.5rem 0.75rem', marginBottom: -1, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {loading && !overview ? (
          <div className="card muted" style={{ padding: '2.5rem', textAlign: 'center' }}>Cargando el resumen…</div>
        ) : tab === 'resumen' ? (
          overview ? <Overview data={overview} money={money} /> : (
            <div className="card muted" style={{ padding: '2.5rem', textAlign: 'center' }}>No se pudo cargar el resumen. Prueba con "Actualizar".</div>
          )
        ) : (
          <>
            <div className="stat-strip">
              <Stat label="Ingresos registrados" value={money(finances.totalVolume)} sub="Arras + saldos + cuotas" />
              <Stat label="Saldos de compra" value={money(finances.totalSales)} sub="Ventas cerradas en caja" />
              <Stat label="Cuotas de alquiler" value={money(finances.totalRent)} sub="Cánones cobrados" />
              <Stat label="Arras en custodia" value={money(finances.totalArras)} sub={`Reembolsado: ${money(finances.totalRefunded)}`} />
              <Stat label="Comisiones" value={money(finances.totalCommissions)} sub={`Por pagar: ${money(finances.pendingCommissions)}`} />
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
              <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: '0.95rem' }}>Libro mayor</h2>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Concepto</th>
                    <th>Cliente</th>
                    <th>Monto</th>
                    <th>Método</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {!finances.payments || finances.payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted" style={{ padding: '2rem', textAlign: 'center' }}>
                        Todavía no hay movimientos.
                      </td>
                    </tr>
                  ) : (
                    finances.payments.map((p) => (
                      <tr key={p.id}>
                        <td><span className="code">{p.id}</span></td>
                        <td>
                          {KIND_LABELS[p.kind] || p.kind || 'Movimiento'}
                          <div className="muted" style={{ fontSize: '0.76rem' }}>{p.concept}</div>
                        </td>
                        <td>{p.clientName || '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: p.status === 'REFUNDED' ? 'var(--rose)' : 'var(--text-main)' }}>{money(p.amount)}</td>
                        <td className="muted">{p.method || '—'}</td>
                        <td>
                          <span className={`status-pill ${p.status === 'PAID' ? 'ok' : 'bad'}`}>
                            {p.status === 'PAID' ? 'Pagado' : p.status === 'REFUNDED' ? 'Reembolsado' : p.status}
                          </span>
                        </td>
                        <td className="muted">{p.created_at ? new Date(p.created_at).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
