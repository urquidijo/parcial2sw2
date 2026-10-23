/**
 * Microfrontend: mfe-contracts-angular
 * Tecnología: Angular Component Pattern (Web Component)
 * Responsabilidad: Gestión ERP Contractual, Protocolos Notariales y Firmas Electrónicas (PostgreSQL).
 */

(function () {
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
      const contract = this.contracts.find(c => String(c.id) === String(contractId) || String(c.protocolNumber) === String(contractId));
      window.dispatchEvent(new CustomEvent('habitat:contract:download', {
        detail: { contractId, contract },
        bubbles: true
      }));
    }

    render() {
      const currentUser = window.HabitatAuth ? window.HabitatAuth.getUser() : null;
      const canSign = currentUser && (currentUser.role === 'LEGAL' || currentUser.role === 'ADMIN' || currentUser.role === 'CLIENTE');

      this.innerHTML = `
        <div class="mfe-contracts-root" style="display:flex; flex-direction:column; gap:1.25rem;">
          <!-- Encabezado Oficial Microfrontend Angular 17 -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; border-bottom:1px solid #e2e8f0; padding-bottom:1.25rem;">
            <div>
              <div style="display:inline-flex; align-items:center; gap:0.4rem; background:#fee2e2; color:#b91c1c; font-size:0.75rem; font-weight:800; padding:0.25rem 0.65rem; border-radius:6px; margin-bottom:0.45rem; border:1px solid #fecaca; letter-spacing:0.02em;">
                🅰️ Microfrontend ERP Notarial (Angular 17 & PostgreSQL Render)
              </div>
              <h2 style="font-size:1.4rem; font-weight:800; color:#0f172a; margin:0;">⚖️ Microfrontend Legal y Notarial (Angular 17)</h2>
              <p style="font-size:0.85rem; color:#64748b; margin:0.25rem 0 0 0;">Desplegado como Micro-App Independiente en Vercel comunicándose con el API Gateway & PostgreSQL.</p>
            </div>
            <button class="btn-refresh btn-sm" id="btnReloadContracts" style="background:#ffffff; border:1px solid #cbd5e1; padding:0.45rem 0.95rem; border-radius:8px; cursor:pointer; font-weight:700; font-size:0.82rem; display:inline-flex; align-items:center; gap:0.45rem; box-shadow:0 1px 2px rgba(0,0,0,0.05); color:#0f172a; transition:all 0.2s ease;">
              🔄 Actualizar Protocolos
            </button>
          </div>

          ${this.loading ? `
            <div class="mfe-loading" style="padding:2.5rem; text-align:center; color:#64748b; background:#ffffff; border-radius:10px; border:1px solid #e2e8f0;">
              ⏳ Consultando registros notariales ACID en PostgreSQL Render...
            </div>
          ` : this.contracts.length === 0 ? `
            <div class="mfe-empty" style="padding:2.5rem; text-align:center; background:#ffffff; border-radius:10px; border:1px solid #e2e8f0; color:#64748b;">
              📋 No hay contratos registrados aún para el usuario o perfil activo.
            </div>
          ` : `
            <div class="data-table-wrapper" style="overflow-x:auto; background:#ffffff; border-radius:10px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
              <table class="data-table" style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
                <thead>
                  <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                    <th style="padding:0.85rem 1rem; color:#64748b; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Protocolo</th>
                    <th style="padding:0.85rem 1rem; color:#64748b; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Inmueble</th>
                    <th style="padding:0.85rem 1rem; color:#64748b; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Tipo de Contrato</th>
                    <th style="padding:0.85rem 1rem; color:#64748b; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Monto Pactado</th>
                    <th style="padding:0.85rem 1rem; color:#64748b; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Estado Notarial</th>
                    <th style="padding:0.85rem 1rem; color:#64748b; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Firmantes Registrados</th>
                    <th style="padding:0.85rem 1rem; color:#64748b; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; text-align:center;">Acciones Legales</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.contracts.map(c => {
                    const isFirmado = c.status === 'FIRMADO' || c.status === 'FIRMADO_NOTARIADO';
                    const isBorrador = c.status === 'BORRADOR';
                    const bgBadge = isFirmado ? '#ecfdf5' : (isBorrador ? '#f1f5f9' : '#fffbeb');
                    const colorBadge = isFirmado ? '#059669' : (isBorrador ? '#475569' : '#b45309');
                    const borderBadge = isFirmado ? '#a7f3d0' : (isBorrador ? '#cbd5e1' : '#fde68a');

                    return `
                      <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.15s ease;">
                        <td style="padding:0.9rem 1rem;"><strong>${c.protocolNumber || c.id}</strong></td>
                        <td style="padding:0.9rem 1rem;">${c.propertyTitle || 'Inmueble #' + (c.propertyId || c.property_id || '')}</td>
                        <td style="padding:0.9rem 1rem;">${c.contractType || c.type || 'PROMESA_COMPRAVENTA'}</td>
                        <td style="padding:0.9rem 1rem; font-weight:700; color:#059669;">$${Number(c.totalAmount || c.total_amount || 0).toLocaleString()} USD</td>
                        <td style="padding:0.9rem 1rem;">
                          <span style="display:inline-block; position:static !important; background:${bgBadge}; color:${colorBadge}; border:1px solid ${borderBadge}; padding:0.28rem 0.65rem; border-radius:6px; font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.03em;">
                            ${c.status || 'BORRADOR'}
                          </span>
                        </td>
                        <td style="padding:0.9rem 1rem; color:#64748b; font-size:0.82rem;">${c.signedBy || c.signaturesCount || '1 de 3 firmas'}</td>
                        <td style="padding:0.9rem 1rem; text-align:center;">
                          ${!isFirmado && canSign ? `
                            <button class="btn-sign-contract" data-id="${c.id}" style="padding:0.35rem 0.75rem; font-size:0.78rem; margin-right:4px; background:#0284c7; color:#ffffff; border:none; border-radius:6px; font-weight:700; cursor:pointer;">✍️ Firmar</button>
                          ` : ''}
                          <button class="btn-download-contract" data-id="${c.id}" style="padding:0.35rem 0.75rem; font-size:0.78rem; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; font-weight:700; cursor:pointer;">📜 Ver Minuta</button>
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
