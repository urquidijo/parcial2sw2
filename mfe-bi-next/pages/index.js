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

export default function BIDashboardPage() {
  const [finances, setFinances] = useState({
    totalVolume: 0,
    totalArras: 0,
    totalCommissions: 0,
    payments: []
  });
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

  const loadFinances = useCallback(async () => {
    if (!session?.allowed) return;
    setLoading(true);
    try {
      await session.keycloak.updateToken(30);
      const res = await fetch(`${resolveApiUrl()}/finances`, {
        headers: { Authorization: `Bearer ${session.keycloak.token}` },
      });
      const result = await res.json();
      if (result && result.success && result.data) {
        setFinances(result.data);
      }
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
            <h1 style={{ fontSize: '1.2rem' }}>Resumen financiero</h1>
            <p className="muted" style={{ fontSize: '0.84rem', marginTop: '0.15rem' }}>Ingresos, arras en custodia, comisiones y movimientos de caja.</p>
          </div>
          <button className="btn btn-secondary" onClick={loadFinances}>Actualizar</button>
        </div>

        {loading ? (
          <div className="card muted" style={{ padding: '2.5rem', textAlign: 'center' }}>Cargando el resumen…</div>
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
