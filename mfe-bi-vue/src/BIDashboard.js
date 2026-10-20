/**
 * Microfrontend: mfe-bi-vue
 * Tecnología: Vue 3 (Custom Element / Web Component)
 * Responsabilidad: Dashboard de Inteligencia de Negocios, Auditoría y Finanzas (Amazon DynamoDB).
 */

(function () {
  class MfeBiElement extends HTMLElement {
    connectedCallback() {
      const apiUrl = this.getAttribute('api-url') || (window.API_URL || 'http://localhost:5000/api');
      this.innerHTML = `<div id="vue-bi-app-mount"></div>`;

      const mountPoint = this.querySelector('#vue-bi-app-mount');

      if (window.Vue) {
        this.app = window.Vue.createApp({
          data() {
            return {
              finances: {
                totalVolume: 0,
                totalArras: 0,
                totalCommissions: 0,
                payments: []
              },
              loading: true,
              apiUrl: apiUrl
            };
          },
          mounted() {
            this.loadFinances();
            this.refreshHandler = () => this.loadFinances();
            window.addEventListener('habitat:refresh:finances', this.refreshHandler);
          },
          beforeUnmount() {
            window.removeEventListener('habitat:refresh:finances', this.refreshHandler);
          },
          methods: {
            async loadFinances() {
              this.loading = true;
              try {
                const res = await fetch(`${this.apiUrl}/finances`);
                const result = await res.json();
                if (result && result.success && result.data) {
                  this.finances = result.data;
                }
              } catch (err) {
                console.error('[mfe-bi-vue] Error cargando analítica de DynamoDB:', err);
              } finally {
                this.loading = false;
              }
            },
            formatMoney(val) {
              return Number(val || 0).toLocaleString();
            }
          },
          template: `
            <div class="mfe-bi-root">
              <div class="mfe-header-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <div class="mfe-badge vue">💚 Microfrontend BI Analytics (Vue 3 & Amazon DynamoDB)</div>
                <button @click="loadFinances" class="btn-refresh btn-sm" style="background:var(--bg-alt); border:1px solid var(--border); padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer;">
                  🔄 Actualizar Métricas
                </button>
              </div>

              <div v-if="loading" class="mfe-loading" style="padding:2rem; text-align:center; color:var(--text-muted);">
                ⏳ Extrayendo eventos transaccionales desde Amazon DynamoDB...
              </div>

              <div v-else>
                <!-- KPI CARDS GRID -->
                <div class="kpi-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                  <div class="kpi-card" style="background:white; border:1px solid var(--border); border-radius:10px; padding:1.25rem;">
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.25rem;">Volumen Total en Cartera</div>
                    <div style="font-size:1.6rem; font-weight:800; color:var(--brand);">$ {{ formatMoney(finances.totalVolume) }} USD</div>
                    <div style="font-size:0.75rem; color:var(--text-light); margin-top:0.25rem;">Consolidado MongoDB + PostgreSQL</div>
                  </div>

                  <div class="kpi-card emerald" style="background:white; border:1px solid var(--border); border-left:4px solid var(--emerald); border-radius:10px; padding:1.25rem;">
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.25rem;">Comisiones de Corretaje (3-5%)</div>
                    <div style="font-size:1.6rem; font-weight:800; color:var(--emerald);">$ {{ formatMoney(finances.totalCommissions) }} USD</div>
                    <div style="font-size:0.75rem; color:var(--text-light); margin-top:0.25rem;">Liquidación escalonada a brokers</div>
                  </div>

                  <div class="kpi-card amber" style="background:white; border:1px solid var(--border); border-left:4px solid var(--amber); border-radius:10px; padding:1.25rem;">
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.25rem;">Arras Fiduciarias en Custodia</div>
                    <div style="font-size:1.6rem; font-weight:800; color:var(--amber);">$ {{ formatMoney(finances.totalArras) }} USD</div>
                    <div style="font-size:0.75rem; color:var(--text-light); margin-top:0.25rem;">Custodia temporal DynamoDB TTL</div>
                  </div>
                </div>

                <!-- TABLA DE MOVIMIENTOS RECIENTES EN DYNAMODB -->
                <div class="data-table-wrapper" style="background:white; border-radius:10px; border:1px solid var(--border); overflow-x:auto;">
                  <div style="padding:1rem; font-weight:700; border-bottom:1px solid var(--border); font-size:0.95rem;">
                    ⚡ Libro Mayor Transaccional (DynamoDB Logs & TTL)
                  </div>
                  <table class="data-table" style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
                    <thead>
                      <tr style="background:#f8fafc; border-bottom:1px solid var(--border);">
                        <th style="padding:0.75rem 1rem;">ID Transacción</th>
                        <th style="padding:0.75rem 1rem;">Concepto</th>
                        <th style="padding:0.75rem 1rem;">Inmueble</th>
                        <th style="padding:0.75rem 1rem;">Monto</th>
                        <th style="padding:0.75rem 1rem;">Método</th>
                        <th style="padding:0.75rem 1rem;">Estado</th>
                        <th style="padding:0.75rem 1rem;">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="!finances.payments || finances.payments.length === 0">
                        <td colspan="7" style="padding:1.5rem; text-align:center; color:var(--text-muted);">No hay transacciones registradas en DynamoDB aún.</td>
                      </tr>
                      <tr v-for="p in finances.payments" :key="p.id" style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:0.75rem 1rem; font-family:monospace; font-weight:600;">{{ p.id }}</td>
                        <td style="padding:0.75rem 1rem;">{{ p.concept }}</td>
                        <td style="padding:0.75rem 1rem;">{{ p.property_id }}</td>
                        <td style="padding:0.75rem 1rem; font-weight:700; color:var(--emerald);">$ {{ formatMoney(p.amount) }} USD</td>
                        <td style="padding:0.75rem 1rem;"><span style="font-size:0.8rem; background:#f1f5f9; padding:2px 8px; border-radius:4px;">{{ p.method }}</span></td>
                        <td style="padding:0.75rem 1rem;">
                          <span :class="['badge-status', p.status === 'PAID' ? 'badge-vendido' : 'badge-cancelado']">
                            {{ p.status === 'PAID' ? 'PAGADO' : p.status }}
                          </span>
                        </td>
                        <td style="padding:0.75rem 1rem; color:var(--text-muted); font-size:0.8rem;">{{ p.created_at }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `
        });
        this.app.mount(mountPoint);
      }
    }

    disconnectedCallback() {
      if (this.app) {
        this.app.unmount();
      }
    }
  }

  if (!customElements.get('mfe-bi')) {
    customElements.define('mfe-bi', MfeBiElement);
    console.log('✅ [Microfrontend Registrado]: <mfe-bi> (Vue 3)');
  }
})();
