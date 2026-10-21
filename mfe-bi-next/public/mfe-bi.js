/**
 * Microfrontend: mfe-bi-next
 * Tecnología: Next.js / React 18 (Custom Element / Web Component)
 * Responsabilidad: Dashboard de Inteligencia de Negocios, Auditoría y Finanzas (Amazon DynamoDB).
 */

(function () {
  const e = React.createElement;

  function resolveApiUrl(attrUrl) {
    if (attrUrl && (attrUrl.startsWith('http://') || attrUrl.startsWith('https://'))) {
      return attrUrl.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.API_URL) {
      return window.API_URL.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined') {
      if (window.location.origin.includes('vercel.app')) {
        return 'https://api-gateway-production-c3ed.up.railway.app/api';
      }
      if (window.location.protocol !== 'file:') {
        return `${window.location.origin}/api`;
      }
    }
    return 'http://localhost:5000/api';
  }

  function BIDashboardComponent({ apiUrl }) {
    const [finances, setFinances] = React.useState({
      totalVolume: 0,
      totalArras: 0,
      totalCommissions: 0,
      payments: []
    });
    const [loading, setLoading] = React.useState(true);

    const baseApi = resolveApiUrl(apiUrl);

    const loadFinances = React.useCallback(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${baseApi}/finances`);
        const result = await res.json();
        if (result && result.success && result.data) {
          setFinances(result.data);
        }
      } catch (err) {
        console.error('[mfe-bi-next] Error cargando analítica de DynamoDB:', err);
      } finally {
        setLoading(false);
      }
    }, [baseApi]);

    React.useEffect(() => {
      loadFinances();
      const handleRefresh = () => loadFinances();
      window.addEventListener('habitat:refresh:finances', handleRefresh);
      return () => window.removeEventListener('habitat:refresh:finances', handleRefresh);
    }, [loadFinances]);

    const formatMoney = (val) => Number(val || 0).toLocaleString();

    return e('div', { className: 'mfe-bi-root', style: { display: 'flex', flexDirection: 'column', gap: '1.5rem' } },
      // Header Bar
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '0.6rem' } },
          e('span', {
            style: {
              background: '#000000',
              color: '#ffffff',
              padding: '0.3rem 0.8rem',
              borderRadius: '9999px',
              fontSize: '0.74rem',
              fontWeight: 800,
              letterSpacing: '0.03em'
            }
          }, '▲ Microfrontend BI Analytics (Next.js 14 & DynamoDB)'),
          e('span', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } }, 'Auditoría en tiempo real de comisiones y fondos')
        ),
        e('button', {
          onClick: loadFinances,
          className: 'btn btn-secondary',
          style: { padding: '0.45rem 0.9rem', fontSize: '0.8rem', cursor: 'pointer' }
        }, '🔄 Actualizar Métricas')
      ),

      loading
        ? e('div', { style: { padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border)' } },
            '⏳ Extrayendo eventos transaccionales desde Amazon DynamoDB AWS...'
          )
        : e(React.Fragment, null,
            // KPI Grid
            e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' } },
              e('div', { style: { background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' } },
                e('div', { style: { fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' } }, 'Volumen Total en Cartera'),
                e('div', { style: { fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand)', margin: '0.35rem 0' } }, `$ ${formatMoney(finances.totalVolume)} USD`),
                e('div', { style: { fontSize: '0.74rem', color: 'var(--text-muted)' } }, 'Consolidado MongoDB Atlas + PostgreSQL')
              ),
              e('div', { style: { background: '#ffffff', border: '1px solid var(--border)', borderLeft: '4px solid var(--emerald)', borderRadius: '12px', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' } },
                e('div', { style: { fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' } }, 'Comisiones de Corretaje (3-5%)'),
                e('div', { style: { fontSize: '1.8rem', fontWeight: 800, color: 'var(--emerald)', margin: '0.35rem 0' } }, `$ ${formatMoney(finances.totalCommissions)} USD`),
                e('div', { style: { fontSize: '0.74rem', color: 'var(--text-muted)' } }, 'Liquidación escalonada a brokers autorizados')
              ),
              e('div', { style: { background: '#ffffff', border: '1px solid var(--border)', borderLeft: '4px solid var(--amber)', borderRadius: '12px', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' } },
                e('div', { style: { fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' } }, 'Arras Fiduciarias en Custodia'),
                e('div', { style: { fontSize: '1.8rem', fontWeight: 800, color: 'var(--amber)', margin: '0.35rem 0' } }, `$ ${formatMoney(finances.totalArras)} USD`),
                e('div', { style: { fontSize: '0.74rem', color: 'var(--text-muted)' } }, 'Custodia temporal en DynamoDB con TTL de 48h')
              )
            ),

            // Data Table
            e('div', { className: 'data-table-wrapper', style: { background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border)', overflowX: 'auto' } },
              e('div', { style: { padding: '1rem 1.25rem', fontWeight: 800, borderBottom: '1px solid var(--border)', fontSize: '0.92rem' } },
                '⚡ Libro Mayor Transaccional (Amazon DynamoDB Logs)'
              ),
              e('table', { className: 'data-table', style: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' } },
                e('thead', null,
                  e('tr', { style: { background: '#f8fafc', borderBottom: '1px solid var(--border)' } },
                    e('th', { style: { padding: '0.85rem 1.25rem' } }, 'ID Transacción'),
                    e('th', { style: { padding: '0.85rem 1.25rem' } }, 'Concepto'),
                    e('th', { style: { padding: '0.85rem 1.25rem' } }, 'Inmueble'),
                    e('th', { style: { padding: '0.85rem 1.25rem' } }, 'Monto'),
                    e('th', { style: { padding: '0.85rem 1.25rem' } }, 'Método'),
                    e('th', { style: { padding: '0.85rem 1.25rem' } }, 'Estado'),
                    e('th', { style: { padding: '0.85rem 1.25rem' } }, 'Fecha')
                  )
                ),
                e('tbody', null,
                  !finances.payments || finances.payments.length === 0
                    ? e('tr', null, e('td', { colSpan: 7, style: { padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' } }, 'No hay transacciones registradas en DynamoDB aún.'))
                    : finances.payments.map((p) =>
                        e('tr', { key: p.id, style: { borderBottom: '1px solid #f1f5f9' } },
                          e('td', { style: { padding: '0.95rem 1.25rem', fontFamily: 'monospace', fontWeight: 600 } }, p.id),
                          e('td', { style: { padding: '0.95rem 1.25rem', fontWeight: 600 } }, p.concept),
                          e('td', { style: { padding: '0.95rem 1.25rem' } }, p.property_id || p.propertyId),
                          e('td', { style: { padding: '0.95rem 1.25rem', fontWeight: 800, color: 'var(--emerald)' } }, `$ ${formatMoney(p.amount)} USD`),
                          e('td', { style: { padding: '0.95rem 1.25rem' } },
                            e('span', { style: { fontSize: '0.75rem', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 } }, p.method)
                          ),
                          e('td', { style: { padding: '0.95rem 1.25rem' } },
                            e('span', {
                              style: {
                                background: p.status === 'PAID' ? '#ecfdf5' : '#fef2f2',
                                color: p.status === 'PAID' ? '#059669' : '#dc2626',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '6px',
                                fontWeight: 700,
                                fontSize: '0.75rem'
                              }
                            }, p.status === 'PAID' ? 'PAGADO' : p.status)
                          ),
                          e('td', { style: { padding: '0.95rem 1.25rem', color: 'var(--text-muted)', fontSize: '0.78rem' } }, p.created_at || p.createdAt)
                        )
                      )
                )
              )
            )
          )
    );
  }

  // Registro del Web Component <mfe-bi>
  class MfeBiElement extends HTMLElement {
    connectedCallback() {
      const apiUrl = resolveApiUrl(this.getAttribute('api-url'));
      if (window.ReactDOM && window.React) {
        this.root = window.ReactDOM.createRoot(this);
        this.root.render(e(BIDashboardComponent, { apiUrl }));
      }
    }

    disconnectedCallback() {
      if (this.root) {
        this.root.unmount();
      }
    }
  }

  if (!customElements.get('mfe-bi')) {
    customElements.define('mfe-bi', MfeBiElement);
    console.log('✅ [Microfrontend Registrado]: <mfe-bi> (Next.js 14 & React 18)');
  }
})();
