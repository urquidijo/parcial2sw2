import React, { useEffect, useState, useCallback } from 'react';

function resolveApiUrl() {
  if (typeof window !== 'undefined') {
    if (window.API_URL) return window.API_URL.replace(/\/$/, '');
    if (window.location.origin.includes('vercel.app')) {
      return 'https://api-gateway-production-c3ed.up.railway.app/api';
    }
    if (window.location.protocol !== 'file:') {
      return `${window.location.origin}/api`;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://api-gateway-production-c3ed.up.railway.app/api';
}

export default function BIDashboardPage() {
  const [finances, setFinances] = useState({
    totalVolume: 0,
    totalArras: 0,
    totalCommissions: 0,
    payments: []
  });
  const [loading, setLoading] = useState(true);

  const loadFinances = useCallback(async () => {
    setLoading(true);
    const apiUrl = resolveApiUrl();
    try {
      const res = await fetch(`${apiUrl}/finances`);
      const result = await res.json();
      if (result && result.success && result.data) {
        setFinances(result.data);
      }
    } catch (err) {
      console.error('[mfe-bi-next] Error cargando analítica de DynamoDB:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFinances();
    const handleRefresh = () => loadFinances();
    window.addEventListener('habitat:refresh:finances', handleRefresh);
    return () => window.removeEventListener('habitat:refresh:finances', handleRefresh);
  }, [loadFinances]);

  const formatMoney = (val) => Number(val || 0).toLocaleString();

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#000000',
            color: '#ffffff',
            padding: '0.35rem 0.85rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 800,
            letterSpacing: '0.03em',
            marginBottom: '0.35rem'
          }}>
            ▲ Microfrontend BI Analytics (Next.js 14 & Amazon DynamoDB)
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Auditoría de fondos en custodia TTL, comisiones de agentes y libro mayor contable.
          </p>
        </div>

        <button
          onClick={loadFinances}
          style={{
            background: '#ffffff',
            border: '1px solid var(--border)',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.82rem',
            color: 'var(--text-main)',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          🔄 Actualizar Métricas
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border)' }}>
          ⏳ Extrayendo eventos transaccionales desde Amazon DynamoDB AWS...
        </div>
      ) : (
        <>
          {/* KPI CARDS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.4rem', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Volumen Total en Cartera
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand)', margin: '0.35rem 0' }}>
                $ {formatMoney(finances.totalVolume)} USD
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Consolidado MongoDB Atlas + PostgreSQL
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderLeft: '4px solid var(--emerald)', borderRadius: '12px', padding: '1.4rem', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Comisiones de Corretaje (3-5%)
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--emerald)', margin: '0.35rem 0' }}>
                $ {formatMoney(finances.totalCommissions)} USD
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Liquidación escalonada a brokers autorizados
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderLeft: '4px solid var(--amber)', borderRadius: '12px', padding: '1.4rem', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Arras Fiduciarias en Custodia
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--amber)', margin: '0.35rem 0' }}>
                $ {formatMoney(finances.totalArras)} USD
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Custodia temporal en DynamoDB con TTL de 48h
              </div>
            </div>
          </div>

          {/* TABLA DE MOVIMIENTOS RECIENTES EN DYNAMODB */}
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border)', overflowX: 'auto', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ padding: '1rem 1.25rem', fontWeight: 800, borderBottom: '1px solid var(--border)', fontSize: '0.95rem' }}>
              ⚡ Libro Mayor Transaccional (Amazon DynamoDB Logs)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>ID Transacción</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Concepto</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Inmueble</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Monto</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Método</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Estado</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {!finances.payments || finances.payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No hay transacciones registradas en DynamoDB aún.
                    </td>
                  </tr>
                ) : (
                  finances.payments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.95rem 1.25rem', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{p.id}</td>
                      <td style={{ padding: '0.95rem 1.25rem', fontWeight: 600 }}>{p.concept}</td>
                      <td style={{ padding: '0.95rem 1.25rem' }}>{p.property_id || p.propertyId}</td>
                      <td style={{ padding: '0.95rem 1.25rem', fontWeight: 800, color: 'var(--emerald)' }}>$ {formatMoney(p.amount)} USD</td>
                      <td style={{ padding: '0.95rem 1.25rem' }}>
                        <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                          {p.method}
                        </span>
                      </td>
                      <td style={{ padding: '0.95rem 1.25rem' }}>
                        <span style={{
                          background: p.status === 'PAID' ? '#ecfdf5' : '#fef2f2',
                          color: p.status === 'PAID' ? '#059669' : '#dc2626',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.75rem'
                        }}>
                          {p.status === 'PAID' ? 'PAGADO' : p.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.95rem 1.25rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{p.created_at || p.createdAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
