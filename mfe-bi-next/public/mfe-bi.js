/**
 * Microfrontend: mfe-bi-next (Web Component <mfe-bi>, React 18)
 * Responsabilidad: Caja y comisiones sobre Amazon DynamoDB.
 *  - Cajero (FINANZAS) y ADMIN: cobro de saldos y cuotas de alquiler (CU16), liquidación de comisiones (CU17), libro mayor.
 *  - Agente: sus comisiones (CU18).
 * El dashboard BI completo (CU19) es la app Next.js separada (pages/index.js).
 */

(function () {
  const e = React.createElement;
  const { useState, useEffect, useCallback } = React;

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

  const PAYMENT_METHODS = [
    ['TRANSFERENCIA', 'Transferencia bancaria'],
    ['EFECTIVO', 'Efectivo en caja'],
    ['QR', 'QR (Simple)'],
    ['TARJETA', 'Tarjeta de débito / crédito'],
  ];
  const KIND_LABELS = { ARRAS: 'Arras de reserva', SALDO_COMPRA: 'Saldo de compra', CUOTA_ALQUILER: 'Cuota de alquiler' };

  const money = (v) => `$ ${Number(v || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })} USD`;
  const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const periodText = (p) => {
    if (!p) return '—';
    const [y, m] = p.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
  };

  function notify(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log('[mfe-bi]', message);
  }

  function currentUser() {
    return (window.HabitatAuth && window.HabitatAuth.getUser && window.HabitatAuth.getUser()) || null;
  }

  // El shell adjunta el token a las llamadas al API; aquí también se envía explícito por si el MFE corre en otro dominio.
  async function apiCall(baseApi, path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = window.HabitatAuth && window.HabitatAuth.getToken && window.HabitatAuth.getToken();
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseApi}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || `Error HTTP ${res.status}`);
    return data;
  }

  // ---------------------------------------------------------------- piezas de interfaz

  // Ícono de Lucide que provee el shell (window.HabitatIcons). Si el MFE corre solo, no muestra nada.
  function Icon({ name, size }) {
    const ref = React.useRef(null);
    useEffect(() => {
      const node = ref.current;
      const svg = window.HabitatIcons ? window.HabitatIcons.el(name, size || 16) : null;
      if (node) node.replaceChildren(...(svg ? [svg] : []));
    }, [name, size]);
    return e('span', { ref, className: 'icon', 'aria-hidden': 'true' });
  }
  const withIcon = (name, label, size) => e(React.Fragment, null, e(Icon, { name, size }), label);

  const card = { background: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' };
  const muted = { fontSize: '0.74rem', color: 'var(--text-muted)' };

  function Kpi({ label, value, sub }) {
    return e('div', { className: 'stat' },
      e('span', { className: 'label' }, label),
      e('span', { className: 'value' }, value),
      sub ? e('span', { className: 'sub' }, sub) : null
    );
  }

  function Pill({ tone, children }) {
    return e('span', { className: `status-pill ${tone || 'off'}` }, children);
  }

  function Modal({ title, onClose, children, footer }) {
    return e('div', { className: 'modal-backdrop open', onClick: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
      e('div', { className: 'modal-window' },
        e('div', { className: 'modal-head' },
          e('h3', null, title),
          e('button', { type: 'button', onClick: onClose, className: 'modal-close', 'aria-label': 'Cerrar' }, e(Icon, { name: 'X', size: 18 }))
        ),
        e('div', { className: 'modal-body' }, children),
        e('div', { className: 'modal-foot' }, footer)
      )
    );
  }

  function Field({ label, children, hint }) {
    return e('div', { className: 'form-group' },
      e('label', null, label),
      children,
      hint ? e('span', { style: muted }, hint) : null
    );
  }

  function Table({ headers, rows, empty }) {
    return e('div', { className: 'data-table-wrapper' },
      e('table', { className: 'data-table' },
        e('thead', null, e('tr', null, headers.map((h) => e('th', { key: h }, h)))),
        e('tbody', null, rows.length
          ? rows
          : e('tr', null, e('td', { colSpan: headers.length, style: { textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' } }, empty)))
      )
    );
  }

  function Tabs({ value, onChange, items }) {
    return e('div', { style: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' } },
      items.map(([key, label]) => e('button', {
        key,
        type: 'button',
        className: value === key ? 'filter-chip active' : 'filter-chip',
        style: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem' },
        onClick: () => onChange(key)
      }, label))
    );
  }

  // ---------------------------------------------------------------- Cajero y ADMIN

  function CashierPanel({ baseApi, refreshKey }) {
    const [tab, setTab] = useState('cobros');
    const [finances, setFinances] = useState(null);
    const [operations, setOperations] = useState([]);
    const [commissions, setCommissions] = useState([]);
    const [commissionFilter, setCommissionFilter] = useState('PENDIENTE_PAGO');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [payTarget, setPayTarget] = useState(null);
    const [payForm, setPayForm] = useState({ method: 'TRANSFERENCIA', period: '', reference: '' });
    const [commissionTarget, setCommissionTarget] = useState(null);
    const [commissionRef, setCommissionRef] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(async () => {
      setLoading(true);
      setError('');
      try {
        const [fin, ops, com] = await Promise.all([
          apiCall(baseApi, '/finances'),
          apiCall(baseApi, '/cashier/operations'),
          apiCall(baseApi, '/commissions'),
        ]);
        setFinances(fin.data);
        setOperations(ops.data || []);
        setCommissions(com.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, [baseApi]);

    useEffect(() => { load(); }, [load, refreshKey]);

    function openPayment(op) {
      setPayTarget(op);
      setPayForm({ method: 'TRANSFERENCIA', period: op.nextPeriod || '', reference: '' });
      setFormError('');
    }

    async function submitPayment() {
      setSaving(true);
      setFormError('');
      try {
        const result = await apiCall(baseApi, '/payments', {
          method: 'POST',
          body: JSON.stringify({
            contractId: payTarget.contractId,
            method: payForm.method,
            period: payTarget.kind === 'CUOTA_ALQUILER' ? payForm.period : undefined,
            reference: payForm.reference.trim() || undefined,
          }),
        });
        const commission = result.followUps && result.followUps.commission;
        const extra = commission && commission.commissionId
          ? ` Comisión de ${commission.agentName} generada: ${money(commission.netAmount)}.`
          : commission === 'SIN_AGENTE' ? ' No se encontró el agente del inmueble: no se generó comisión.' : '';
        notify(result.message + extra);
        setPayTarget(null);
        window.dispatchEvent(new CustomEvent('habitat:refresh:properties'));
        await load();
      } catch (err) {
        setFormError(err.message);
      } finally {
        setSaving(false);
      }
    }

    async function submitCommission() {
      setSaving(true);
      setFormError('');
      try {
        const c = commissionTarget;
        await apiCall(baseApi, `/commissions/${encodeURIComponent(c.agentId)}/${encodeURIComponent(c.commissionId)}/pay`, {
          method: 'POST',
          body: JSON.stringify({ reference: commissionRef.trim() || undefined }),
        });
        notify(`Comisión ${c.commissionId} pagada a ${c.agentName || c.agentId}.`);
        setCommissionTarget(null);
        await load();
      } catch (err) {
        setFormError(err.message);
      } finally {
        setSaving(false);
      }
    }

    const pendingOps = operations.filter((o) => !o.settled).length;
    const pendingCommissions = commissions.filter((c) => c.status === 'PENDIENTE_PAGO');
    const visibleCommissions = commissionFilter === 'TODAS' ? commissions : commissions.filter((c) => c.status === commissionFilter);

    const operationRows = operations.map((op) => {
      const isRent = op.kind === 'CUOTA_ALQUILER';
      const state = isRent
        ? e('div', null,
            e(Pill, { tone: op.paidPeriods.length ? 'ok' : 'warn' }, `${op.paidPeriods.length} cuota(s) pagada(s)`),
            e('div', { style: { ...muted, marginTop: '0.25rem' } }, `Próxima: ${periodText(op.nextPeriod)}`))
        : e(Pill, { tone: op.settled ? 'ok' : 'warn' }, op.settled ? 'Saldo pagado' : 'Saldo pendiente');
      return e('tr', { key: op.contractNumber },
        e('td', null, e('strong', null, op.contractNumber), e('div', { style: muted }, isRent ? 'Arrendamiento' : 'Compraventa')),
        e('td', null, op.clientName || op.clientId),
        e('td', null, op.propertyTitle || op.propertyId),
        e('td', null, e('strong', null, money(op.amountDue)), e('div', { style: muted }, isRent ? 'canon mensual' : `precio ${money(op.totalAmount)} − anticipo ${money(op.downPayment)}`)),
        e('td', null, state),
        e('td', null, op.settled
          ? e('span', { style: muted }, 'Operación cerrada')
          : e('button', { type: 'button', className: 'btn', style: { padding: '0.35rem 0.7rem', fontSize: '0.78rem' }, onClick: () => openPayment(op) },
              withIcon('Banknote', isRent ? 'Cobrar cuota' : 'Cobrar saldo', 14)))
      );
    });

    const commissionRows = visibleCommissions.map((c) => e('tr', { key: `${c.agentId}-${c.commissionId}` },
      e('td', null, e('strong', null, c.agentName || c.agentId), e('div', { style: muted }, c.agentEmail || c.agentId)),
      e('td', null, c.contractNumber || c.propertyId, e('div', { style: muted }, c.operationType === 'ALQUILER' ? 'Alquiler (12 meses)' : 'Venta')),
      e('td', null, money(c.baseAmount)),
      e('td', null, e('strong', { style: { color: 'var(--emerald)' } }, money(c.netAmount)),
        e('div', { style: muted }, `bruto ${money(c.grossAmount)} − ret. 13% ${money(c.taxRetention)}`)),
      e('td', null, c.status === 'PAGADA'
        ? e('div', null, e(Pill, { tone: 'ok' }, 'Pagada'), e('div', { style: { ...muted, marginTop: '0.25rem' } }, `${dateText(c.paidAt)}${c.paymentReference ? ' · ' + c.paymentReference : ''}`))
        : e(Pill, { tone: 'warn' }, 'Pendiente de pago')),
      e('td', null, c.status === 'PENDIENTE_PAGO'
        ? e('button', { type: 'button', className: 'btn', style: { padding: '0.35rem 0.7rem', fontSize: '0.78rem' }, onClick: () => { setCommissionTarget(c); setCommissionRef(''); setFormError(''); } }, withIcon('HandCoins', 'Liquidar', 14))
        : e('span', { style: muted }, c.paidBy ? `por ${c.paidBy}` : '—'))
    ));

    const ledgerRows = ((finances && finances.payments) || []).map((p) => e('tr', { key: p.id },
      e('td', null, e('span', { className: 'folio-tag' }, p.id)),
      e('td', null, KIND_LABELS[p.kind] || p.kind, e('div', { style: muted }, p.concept)),
      e('td', null, p.clientName || '—'),
      e('td', { style: { fontVariantNumeric: 'tabular-nums', color: p.status === 'REFUNDED' ? 'var(--rose)' : 'var(--text-main)' } }, money(p.amount)),
      e('td', null, p.method || '—'),
      e('td', null, e(Pill, { tone: p.status === 'PAID' ? 'ok' : 'bad' }, p.status === 'PAID' ? 'Pagado' : p.status === 'REFUNDED' ? 'Reembolsado' : p.status)),
      e('td', { style: muted }, dateText(p.created_at))
    ));

    return e(React.Fragment, null,
      finances && e('div', { className: 'stat-strip' },
        e(Kpi, { label: 'Ingresos registrados', value: money(finances.totalVolume), sub: 'Arras + saldos + cuotas' }),
        e(Kpi, { label: 'Saldos de compra', value: money(finances.totalSales), sub: 'Ventas cerradas en caja' }),
        e(Kpi, { label: 'Cuotas de alquiler', value: money(finances.totalRent), sub: 'Cánones cobrados' }),
        e(Kpi, { label: 'Arras en custodia', value: money(finances.totalArras), sub: `Reembolsado: ${money(finances.totalRefunded)}` }),
        e(Kpi, { label: 'Comisiones por pagar', value: money(finances.pendingCommissions), sub: `Pagadas: ${money(finances.paidCommissions)}` })
      ),

      e(Tabs, {
        value: tab,
        onChange: setTab,
        items: [
          ['cobros', withIcon('CreditCard', `Cobros${pendingOps ? ` (${pendingOps})` : ''}`, 14)],
          ['comisiones', withIcon('Briefcase', `Comisiones${pendingCommissions.length ? ` (${pendingCommissions.length})` : ''}`, 14)],
          ['libro', withIcon('BookOpen', 'Libro mayor', 14)],
        ],
      }),

      error && e('div', { className: 'notice error' }, error),

      loading
        ? e('div', { style: { ...card, padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' } }, 'Cargando la caja…')
        : tab === 'cobros'
          ? e(React.Fragment, null,
              e('div', { style: muted }, 'Contratos de compraventa y arrendamiento firmados por el cliente y el Oficial Legal. Al cobrar el saldo (o la primera cuota) el inmueble pasa a vendido/alquilado y se genera la comisión del agente.'),
              e(Table, { headers: ['Contrato', 'Cliente', 'Inmueble', 'A cobrar', 'Estado', 'Acción'], rows: operationRows, empty: 'No hay contratos firmados pendientes de cobro.' }))
          : tab === 'comisiones'
            ? e(React.Fragment, null,
                e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' } },
                  e('div', { style: muted }, 'Comisión: 3% del valor de la operación (venta, o 12 meses de alquiler) menos 13% de retención impositiva.'),
                  e('select', { className: 'filter-select', value: commissionFilter, onChange: (ev) => setCommissionFilter(ev.target.value) },
                    e('option', { value: 'PENDIENTE_PAGO' }, 'Pendientes'),
                    e('option', { value: 'PAGADA' }, 'Pagadas'),
                    e('option', { value: 'TODAS' }, 'Todas'))),
                e(Table, { headers: ['Agente', 'Operación', 'Base', 'Neto a pagar', 'Estado', 'Acción'], rows: commissionRows, empty: 'No hay comisiones en este filtro.' }))
            : e(Table, { headers: ['ID', 'Concepto', 'Cliente', 'Monto', 'Método', 'Estado', 'Fecha'], rows: ledgerRows, empty: 'No hay movimientos registrados.' }),

      payTarget && e(Modal, {
        title: payTarget.kind === 'CUOTA_ALQUILER' ? 'Cobrar cuota de alquiler' : 'Cobrar saldo de compra',
        onClose: () => setPayTarget(null),
        footer: e(React.Fragment, null,
          e('button', { type: 'button', className: 'btn btn-secondary', onClick: () => setPayTarget(null) }, 'Cancelar'),
          e('button', { type: 'button', className: 'btn', disabled: saving, onClick: submitPayment }, saving ? 'Registrando…' : `Registrar ${money(payTarget.amountDue)}`)),
      },
        formError && e('div', { className: 'notice error' }, formError),
        e('div', { className: 'summary-box' },
          e('div', { className: 'title' }, payTarget.propertyTitle || payTarget.propertyId),
          e('div', { className: 'meta' }, `${payTarget.contractNumber} · ${payTarget.clientName || payTarget.clientId}`),
          e('div', { className: 'amount' }, money(payTarget.amountDue))),
        payTarget.kind === 'CUOTA_ALQUILER' && e(Field, { label: 'Mes que se paga *', hint: payTarget.paidPeriods.length ? `Ya pagados: ${payTarget.paidPeriods.map(periodText).join(', ')}` : 'Es la primera cuota: el inmueble pasará a ALQUILADO.' },
          e('input', { type: 'month', className: 'form-control', value: payForm.period, onChange: (ev) => setPayForm({ ...payForm, period: ev.target.value }) })),
        e(Field, { label: 'Método de pago *' },
          e('select', { className: 'form-control', value: payForm.method, onChange: (ev) => setPayForm({ ...payForm, method: ev.target.value }) },
            PAYMENT_METHODS.map(([value, label]) => e('option', { key: value, value }, label)))),
        e(Field, { label: 'Referencia (n° de transferencia, recibo…)' },
          e('input', { className: 'form-control', maxLength: 100, value: payForm.reference, onChange: (ev) => setPayForm({ ...payForm, reference: ev.target.value }) }))
      ),

      commissionTarget && e(Modal, {
        title: 'Liquidar comisión',
        onClose: () => setCommissionTarget(null),
        footer: e(React.Fragment, null,
          e('button', { type: 'button', className: 'btn btn-secondary', onClick: () => setCommissionTarget(null) }, 'Cancelar'),
          e('button', { type: 'button', className: 'btn', disabled: saving, onClick: submitCommission }, saving ? 'Pagando…' : `Pagar ${money(commissionTarget.netAmount)}`)),
      },
        formError && e('div', { className: 'notice error' }, formError),
        e('div', { className: 'summary-box' },
          e('div', { className: 'title' }, commissionTarget.agentName || commissionTarget.agentId),
          e('div', { className: 'meta' }, `${commissionTarget.commissionId} · ${commissionTarget.contractNumber || commissionTarget.propertyId}`),
          e('div', { className: 'amount' }, money(commissionTarget.netAmount))),
        e(Field, { label: 'Referencia del pago al agente' },
          e('input', { className: 'form-control', maxLength: 100, value: commissionRef, onChange: (ev) => setCommissionRef(ev.target.value), placeholder: 'Ej.: TRF-000123' }))
      )
    );
  }

  // ---------------------------------------------------------------- Agente (CU18)

  function AgentPanel({ baseApi, refreshKey }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
      setError('');
      try {
        setData((await apiCall(baseApi, '/commissions/mine')).data);
      } catch (err) {
        setError(err.message);
      }
    }, [baseApi]);

    useEffect(() => { load(); }, [load, refreshKey]);

    if (error) return e('div', { className: 'notice error' }, error);
    if (!data) return e('div', { style: { ...card, padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' } }, 'Cargando tus comisiones…');

    const rows = data.commissions.map((c) => e('tr', { key: c.commissionId },
      e('td', null, e('strong', null, c.contractNumber || c.propertyId), e('div', { style: muted }, c.operationType === 'ALQUILER' ? 'Alquiler' : 'Venta')),
      e('td', null, money(c.baseAmount)),
      e('td', null, money(c.grossAmount), e('div', { style: muted }, `ret. 13%: ${money(c.taxRetention)}`)),
      e('td', null, e('strong', { style: { color: 'var(--emerald)' } }, money(c.netAmount))),
      e('td', null, c.status === 'PAGADA' ? e(Pill, { tone: 'ok' }, 'Pagada') : e(Pill, { tone: 'warn' }, 'Por cobrar')),
      e('td', { style: muted }, c.status === 'PAGADA' ? `${dateText(c.paidAt)}${c.paymentReference ? ' · ' + c.paymentReference : ''}` : dateText(c.createdAt))
    ));

    return e(React.Fragment, null,
      e('div', { className: 'stat-strip' },
        e(Kpi, { label: 'Por cobrar', value: money(data.pendingUSD), sub: 'Pendiente de liquidar en caja' }),
        e(Kpi, { label: 'Cobrado', value: money(data.paidUSD), sub: 'Ya pagado por el Cajero' }),
        e(Kpi, { label: 'Total generado', value: money(data.totalBalanceUSD), sub: `${data.count} operación(es) cerrada(s)` })
      ),
      e(Table, { headers: ['Operación', 'Valor', 'Bruto (3%)', 'Neto', 'Estado', 'Fecha'], rows, empty: 'Aún no tienes comisiones: se generan cuando se cierra la venta o el alquiler de un inmueble que publicaste.' })
    );
  }

  // ---------------------------------------------------------------- raíz

  function BIDashboardComponent({ apiUrl }) {
    const [user, setUser] = useState(currentUser());
    const [refreshKey, setRefreshKey] = useState(0);
    const baseApi = resolveApiUrl(apiUrl);

    useEffect(() => {
      const onRefresh = () => {
        setUser(currentUser());
        setRefreshKey((k) => k + 1);
      };
      window.addEventListener('habitat:refresh:finances', onRefresh);
      return () => window.removeEventListener('habitat:refresh:finances', onRefresh);
    }, []);

    const role = user && user.role;
    const isCashier = role === 'FINANZAS' || role === 'ADMIN';
    const isAgent = role === 'AGENTE';

    return e('div', { className: 'mfe-bi-root', style: { display: 'flex', flexDirection: 'column', gap: '1.25rem' } },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' } },
        e('div', null,
          e('h2', { style: { fontSize: '1.2rem' } }, isAgent ? 'Mis comisiones' : 'Caja'),
          e('p', { style: { fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.15rem' } },
            isAgent ? 'Comisiones de las operaciones que cerraste.' : 'Cobro de saldos y cuotas, y liquidación de comisiones.')
        ),
        e('button', { type: 'button', className: 'btn btn-secondary', onClick: () => setRefreshKey((k) => k + 1) }, withIcon('RefreshCw', 'Actualizar', 14))
      ),
      isCashier
        ? e(CashierPanel, { baseApi, refreshKey })
        : isAgent
          ? e(AgentPanel, { baseApi, refreshKey })
          : e('div', { style: { ...card, padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' } }, 'Esta sección es para el Cajero, el Administrador y los agentes.')
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
    console.log('[Microfrontend registrado] <mfe-bi> (Caja y comisiones · React 18)');
  }
})();
