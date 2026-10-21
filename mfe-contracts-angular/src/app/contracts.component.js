/**
 * Microfrontend: mfe-contracts-angular
 * Tecnología: Angular Component Pattern (Web Component)
 * Responsabilidad: Gestión ERP Contractual, Protocolos Notariales y Firmas Electrónicas (PostgreSQL).
 */

(function () {
  function resolveApiUrl(attrUrl) {
    if (attrUrl) return attrUrl.replace(/\/$/, '');
    if (typeof window !== 'undefined' && window.API_URL) return window.API_URL.replace(/\/$/, '');
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

  class MfeContractsElement extends HTMLElement {
    constructor() {
      super();
      this.contracts = [];
      this.loading = true;
    }

    connectedCallback() {
      this.apiUrl = resolveApiUrl(this.getAttribute('api-url'));
      this.render();
      this.loadContracts();

      this.refreshHandler = () => this.loadContracts();
      window.addEventListener('habitat:refresh:contracts', this.refreshHandler);
    }

    disconnectedCallback() {
      window.removeEventListener('habitat:refresh:contracts', this.refreshHandler);
    }

    async loadContracts() {
      this.loading = true;
      this.render();

      try {
        const currentUser = window.HabitatAuth ? window.HabitatAuth.getUser() : null;
        let url = `${this.apiUrl}/contracts`;
        if (currentUser && currentUser.role === 'CLIENTE') {
          url += `?userId=${currentUser.id}&role=CLIENTE`;
        }

        const res = await fetch(url);
        const result = await res.json();
        if (result && result.success && Array.isArray(result.data)) {
          this.contracts = result.data;
        } else if (Array.isArray(result)) {
          this.contracts = result;
        } else {
          this.contracts = [];
        }
      } catch (err) {
        console.error('[mfe-contracts-angular] Error cargando contratos:', err);
        this.contracts = [];
      } finally {
        this.loading = false;
        this.render();
      }
    }

    handleSign(contractId) {
      window.dispatchEvent(new CustomEvent('habitat:contract:sign', {
        detail: { contractId },
        bubbles: true
      }));
    }

    handleDownload(contractId) {
      window.dispatchEvent(new CustomEvent('habitat:contract:download', {
        detail: { contractId },
        bubbles: true
      }));
    }

    render() {
      const currentUser = window.HabitatAuth ? window.HabitatAuth.getUser() : null;
      const canSign = currentUser && (currentUser.role === 'LEGAL' || currentUser.role === 'ADMIN' || currentUser.role === 'CLIENTE');

      this.innerHTML = `
        <div class="mfe-contracts-root">
          <div class="mfe-header-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <div class="mfe-badge angular">🅰️ Microfrontend ERP Notarial (Angular 17 & PostgreSQL Render)</div>
            <button class="btn-refresh btn-sm" id="btnReloadContracts" style="background:var(--bg-alt); border:1px solid var(--border); padding:0.4rem 0.8rem; border-radius:6px; cursor:pointer;">
              🔄 Actualizar Protocolos
            </button>
          </div>

          ${this.loading ? `
            <div class="mfe-loading" style="padding:2rem; text-align:center; color:var(--text-muted);">
              ⏳ Consultando registros notariales ACID en PostgreSQL Render...
            </div>
          ` : this.contracts.length === 0 ? `
            <div class="mfe-empty" style="padding:2rem; text-align:center; background:white; border-radius:10px; border:1px solid var(--border);">
              📋 No hay contratos registrados aún para el usuario o perfil activo.
            </div>
          ` : `
            <div class="data-table-wrapper" style="overflow-x:auto; background:white; border-radius:10px; border:1px solid var(--border);">
              <table class="data-table" style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
                <thead>
                  <tr style="background:#f8fafc; border-bottom:1px solid var(--border);">
                    <th style="padding:0.75rem 1rem;">Protocolo</th>
                    <th style="padding:0.75rem 1rem;">Inmueble</th>
                    <th style="padding:0.75rem 1rem;">Tipo de Contrato</th>
                    <th style="padding:0.75rem 1rem;">Monto Pactado</th>
                    <th style="padding:0.75rem 1rem;">Estado Notarial</th>
                    <th style="padding:0.75rem 1rem;">Firmantes Registrados</th>
                    <th style="padding:0.75rem 1rem; text-align:center;">Acciones Legales</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.contracts.map(c => {
                    const statusClass = c.status === 'FIRMADO' ? 'badge-vendido' : (c.status === 'CANCELADO' ? 'badge-cancelado' : 'badge-reservado');
                    return `
                      <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:0.75rem 1rem;"><strong>${c.protocolNumber || c.id}</strong></td>
                        <td style="padding:0.75rem 1rem;">${c.propertyTitle || 'Inmueble #' + (c.propertyId || c.property_id || '')}</td>
                        <td style="padding:0.75rem 1rem;">${c.contractType || c.type || 'PROMESA_COMPRAVENTA'}</td>
                        <td style="padding:0.75rem 1rem; font-weight:600; color:var(--emerald);">$${Number(c.totalAmount || c.total_amount || 0).toLocaleString()} USD</td>
                        <td style="padding:0.75rem 1rem;"><span class="badge-status ${statusClass}">${c.status || 'BORRADOR'}</span></td>
                        <td style="padding:0.75rem 1rem; color:var(--text-muted); font-size:0.8rem;">${c.signedBy || c.signaturesCount || '1 de 3 firmas'}</td>
                        <td style="padding:0.75rem 1rem; text-align:center;">
                          ${c.status !== 'FIRMADO' && canSign ? `
                            <button class="btn-sign-contract btn-primary btn-sm" data-id="${c.id}" style="padding:0.35rem 0.7rem; font-size:0.78rem; margin-right:4px;">✍️ Firmar</button>
                          ` : ''}
                          <button class="btn-download-contract btn-secondary btn-sm" data-id="${c.id}" style="padding:0.35rem 0.7rem; font-size:0.78rem;">📜 Ver Minuta</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;

      // Event listeners para los botones dentro del DOM del componente
      const reloadBtn = this.querySelector('#btnReloadContracts');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', () => this.loadContracts());
      }

      this.querySelectorAll('.btn-sign-contract').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          this.handleSign(id);
        });
      });

      this.querySelectorAll('.btn-download-contract').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          this.handleDownload(id);
        });
      });
    }
  }

  if (!customElements.get('mfe-contracts')) {
    customElements.define('mfe-contracts', MfeContractsElement);
    console.log('✅ [Microfrontend Registrado]: <mfe-contracts> (Angular 17)');
  }
})();
