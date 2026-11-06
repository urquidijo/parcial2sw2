import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ErpIconComponent } from './erp-icon.component';
import { ErpModalComponent } from './erp-modal.component';
import { GraphqlService } from './graphql.service';
import { HabitatUser, notify } from './habitat-bridge';
import { CONTRACT_TYPE_LABELS, Client, Contract, ContractStatus, ContractType, PropertySummary } from './models';

const CONTRACT_FIELDS = `
  id contractNumber contractType status propertyId propertyTitle clientId clientName
  totalAmount downPayment legalClauses cancellationReason signedBy signaturesRequired createdAt
  signatures { signerName signerRole documentHash signedAt }
  property { code title city zone price }
`;
const CONTRACTS_QUERY = `query Contracts { contracts { ${CONTRACT_FIELDS} } }`;
const FORM_DATA_QUERY = `query ContractFormData { properties { code title price city zone status } clients { id name email } }`;
const CREATE_CONTRACT = `mutation CreateContract($input: CreateContractInput!) { createContract(input: $input) { id contractNumber } }`;
const CANCEL_CONTRACT = `mutation CancelContract($id: ID!, $reason: String!) { cancelContract(id: $id, reason: $reason) { id status } }`;
const SIGN_CONTRACT = `mutation SignContract($id: ID!) { signContract(id: $id) { id status } }`;

const STATUS_LABELS: Record<ContractStatus, string> = {
  BORRADOR: 'Borrador',
  PENDIENTE_FIRMA: 'Pendiente de firma',
  FIRMADO: 'Firmado',
  CANCELADO: 'Anulado',
  RECHAZADO: 'Rechazado',
  CONCLUIDO: 'Concluido',
};

interface ContractForm {
  propertyId: string;
  clientId: string;
  contractType: ContractType;
  totalAmount: number | null;
  downPayment: number | null;
  legalClauses: string;
}

@Component({
  selector: 'erp-contracts',
  standalone: true,
  imports: [FormsModule, ErpModalComponent, ErpIconComponent, CurrencyPipe, DatePipe],
  template: `
    <div class="erp-toolbar">
      <div>
        <h2>{{ isClient() ? 'Mis contratos' : 'Contratos' }}</h2>
        <p>{{ isClient() ? 'Revisa y firma digitalmente tus contratos.' : 'Genera contratos de compraventa o alquiler, firma con fe pública y anula los que no sigan.' }}</p>
      </div>
      <div class="erp-actions">
        <select class="filter-select" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
          <option value="ALL">Todos los estados</option>
          @for (s of statusOptions; track s) { <option [value]="s">{{ statusLabels[s] }}</option> }
        </select>
        <button class="btn btn-secondary" type="button" (click)="load()"><erp-icon name="RefreshCw" [size]="14" />Actualizar</button>
        @if (canManage()) {
          <button class="btn" type="button" (click)="openCreate()"><erp-icon name="Plus" [size]="14" />Generar contrato</button>
        }
      </div>
    </div>

    @if (error()) { <div class="erp-error">{{ error() }}</div> }

    @if (loading()) {
      <div class="erp-empty">Cargando contratos…</div>
    } @else if (filtered().length === 0) {
      <div class="erp-empty">No hay contratos {{ statusFilter() === 'ALL' ? '' : 'con ese estado' }}.</div>
    } @else {
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Contrato</th><th>Tipo</th><th>Inmueble</th>
              @if (!isClient()) { <th>Cliente</th> }
              <th>Monto</th><th>Firmas</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (c of filtered(); track c.id) {
              <tr>
                <td><span class="erp-code">{{ c.contractNumber }}</span><div class="erp-muted">{{ c.createdAt | date: 'dd/MM/yyyy' }}</div></td>
                <td>{{ typeLabels[c.contractType] }}</td>
                <td>{{ c.property?.title || c.propertyTitle || c.propertyId }}<div class="erp-muted">{{ c.property?.city || '' }}</div></td>
                @if (!isClient()) { <td>{{ c.clientName || c.clientId }}</td> }
                <td>{{ c.totalAmount | currency: 'USD' : 'symbol' : '1.0-0' }}</td>
                <td>{{ c.signatures.length }} de {{ c.signaturesRequired }}</td>
                <td><span class="erp-status" [class]="statusClass(c.status)">{{ statusLabels[c.status] }}</span></td>
                <td>
                  <div class="erp-row-actions">
                    <button class="btn btn-secondary" type="button" (click)="selected.set(c)">Ver</button>
                    @if (canSignAsClient(c)) {
                      <button class="btn" type="button" [disabled]="busyId() === c.id" (click)="sign(c)"><erp-icon name="PenLine" [size]="14" />Firmar</button>
                    }
                    @if (canSignAsLegal(c)) {
                      <button class="btn" type="button" [disabled]="busyId() === c.id" (click)="sign(c)"><erp-icon name="Scale" [size]="14" />Dar fe pública</button>
                    }
                    @if (canManage() && c.status !== 'CANCELADO' && c.status !== 'CONCLUIDO') {
                      <button class="btn-logout" type="button" (click)="openCancel(c)">Anular</button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (selected(); as c) {
      <erp-modal [title]="'Contrato ' + c.contractNumber" [maxWidth]="720" (closed)="selected.set(null)">
        <div class="erp-grid-2">
          <div><div class="erp-muted">Tipo</div><strong>{{ typeLabels[c.contractType] }}</strong></div>
          <div><div class="erp-muted">Estado</div><span class="erp-status" [class]="statusClass(c.status)">{{ statusLabels[c.status] }}</span></div>
          <div><div class="erp-muted">Inmueble</div><strong>{{ c.property?.title || c.propertyTitle || c.propertyId }}</strong></div>
          <div><div class="erp-muted">Cliente</div><strong>{{ c.clientName || c.clientId }}</strong></div>
          <div><div class="erp-muted">Monto</div><strong>{{ c.totalAmount | currency: 'USD' }}</strong></div>
          <div><div class="erp-muted">Anticipo / garantía</div><strong>{{ c.downPayment | currency: 'USD' }}</strong></div>
        </div>
        @if (c.cancellationReason) { <div class="erp-error">Anulado: {{ c.cancellationReason }}</div> }
        <div class="erp-clauses">{{ c.legalClauses }}</div>
        <div>
          <strong class="erp-section-title">Firmas digitales ({{ c.signatures.length }} de {{ c.signaturesRequired }})</strong>
          @for (s of c.signatures; track s.documentHash) {
            <div class="erp-signature">
              <div>
                <strong>{{ s.signerName }}</strong> · {{ s.signerRole === 'LEGAL' ? 'Oficial Legal (fe pública)' : 'Cliente titular' }}
                <div class="erp-hash">SHA-256: {{ s.documentHash }}</div>
              </div>
              <div class="erp-muted">{{ s.signedAt | date: 'dd/MM/yyyy HH:mm' }}</div>
            </div>
          } @empty {
            <div class="erp-muted erp-gap-top">Aún no hay firmas.</div>
          }
        </div>
        <div modal-footer>
          <button class="btn btn-secondary" type="button" (click)="selected.set(null)">Cerrar</button>
          @if (canSignAsClient(c) || canSignAsLegal(c)) {
            <button class="btn" type="button" [disabled]="busyId() === c.id" (click)="sign(c)"><erp-icon [name]="isClient() ? 'PenLine' : 'Scale'" [size]="14" />{{ isClient() ? 'Firmar' : 'Dar fe pública' }}</button>
          }
        </div>
      </erp-modal>
    }

    @if (showCreate()) {
      <erp-modal title="Generar contrato" [maxWidth]="720" (closed)="showCreate.set(false)">
        @if (formError()) { <div class="erp-error">{{ formError() }}</div> }
        <div class="erp-grid-2">
          <div class="form-group">
            <label>Tipo de contrato *</label>
            <select class="form-control" [(ngModel)]="form.contractType" (ngModelChange)="refreshClauses()">
              <option value="PROMESA_COMPRAVENTA">Compraventa</option>
              <option value="ARRENDAMIENTO">Alquiler</option>
            </select>
          </div>
          <div class="form-group">
            <label>Inmueble *</label>
            <select class="form-control" [(ngModel)]="form.propertyId" (ngModelChange)="onPropertyChange()">
              <option value="">Selecciona…</option>
              @for (p of properties(); track p.code) { <option [value]="p.code">{{ p.title }} ({{ p.code }} · {{ p.status }})</option> }
            </select>
          </div>
          <div class="form-group">
            <label>Cliente *</label>
            <select class="form-control" [(ngModel)]="form.clientId" (ngModelChange)="refreshClauses()">
              <option value="">Selecciona…</option>
              @for (cl of clients(); track cl.id) { <option [value]="cl.id">{{ cl.name }} · {{ cl.email }}</option> }
            </select>
          </div>
          <div class="form-group">
            <label>{{ form.contractType === 'ARRENDAMIENTO' ? 'Canon mensual (USD) *' : 'Precio total (USD) *' }}</label>
            <input class="form-control" type="number" min="1" [(ngModel)]="form.totalAmount" (ngModelChange)="refreshClauses()">
          </div>
          <div class="form-group">
            <label>{{ form.contractType === 'ARRENDAMIENTO' ? 'Garantía (USD)' : 'Anticipo (USD)' }}</label>
            <input class="form-control" type="number" min="0" [(ngModel)]="form.downPayment" (ngModelChange)="refreshClauses()">
          </div>
        </div>
        <div class="form-group">
          <label>Cláusulas (generadas a partir de la plantilla; puedes editarlas)</label>
          <textarea class="form-control" rows="9" [(ngModel)]="form.legalClauses" (ngModelChange)="clausesEdited = true"></textarea>
        </div>
        <div modal-footer>
          <button class="btn btn-secondary" type="button" (click)="showCreate.set(false)">Cancelar</button>
          <button class="btn" type="button" [disabled]="saving()" (click)="create()">{{ saving() ? 'Generando…' : 'Generar contrato' }}</button>
        </div>
      </erp-modal>
    }

    @if (cancelTarget(); as c) {
      <erp-modal [title]="'Anular ' + c.contractNumber" (closed)="cancelTarget.set(null)">
        @if (formError()) { <div class="erp-error">{{ formError() }}</div> }
        <p class="erp-text">El contrato quedará anulado y se podrá generar uno nuevo para el inmueble.</p>
        <div class="form-group">
          <label>Motivo de la anulación *</label>
          <textarea class="form-control" rows="3" maxlength="500" [(ngModel)]="cancelReason"></textarea>
        </div>
        <div modal-footer>
          <button class="btn btn-secondary" type="button" (click)="cancelTarget.set(null)">Volver</button>
          <button class="btn-logout" type="button" [disabled]="saving()" (click)="confirmCancel(c)">{{ saving() ? 'Anulando…' : 'Anular contrato' }}</button>
        </div>
      </erp-modal>
    }
  `,
})
export class ContractsViewComponent implements OnChanges {
  @Input({ required: true }) user!: HabitatUser;
  @Input() refreshKey = 0;

  private readonly graphql = inject(GraphqlService);

  readonly typeLabels = CONTRACT_TYPE_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly statusOptions = Object.keys(STATUS_LABELS) as ContractStatus[];

  readonly contracts = signal<Contract[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly statusFilter = signal<'ALL' | ContractStatus>('ALL');
  readonly selected = signal<Contract | null>(null);
  readonly busyId = signal<string | null>(null);

  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly properties = signal<PropertySummary[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly cancelTarget = signal<Contract | null>(null);
  form: ContractForm = this.emptyForm();
  clausesEdited = false;
  cancelReason = '';

  readonly filtered = computed(() => {
    const filter = this.statusFilter();
    return filter === 'ALL' ? this.contracts() : this.contracts().filter((c) => c.status === filter);
  });

  isClient = () => this.user.role === 'CLIENTE';
  canManage = () => this.user.role === 'LEGAL' || this.user.role === 'ADMIN';

  ngOnChanges(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.graphql.request<{ contracts: Contract[] }>(CONTRACTS_QUERY);
      this.contracts.set(data.contracts);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  statusClass(status: ContractStatus): string {
    if (status === 'FIRMADO' || status === 'CONCLUIDO') return 'erp-status ok';
    if (status === 'PENDIENTE_FIRMA' || status === 'BORRADOR') return 'erp-status warn';
    if (status === 'RECHAZADO') return 'erp-status bad';
    return 'erp-status off';
  }

  private hasSignature(c: Contract, role: 'CLIENTE' | 'LEGAL'): boolean {
    return c.signatures.some((s) => s.signerRole === role);
  }

  canSignAsClient(c: Contract): boolean {
    return this.isClient() && c.status === 'PENDIENTE_FIRMA' && !this.hasSignature(c, 'CLIENTE');
  }

  canSignAsLegal(c: Contract): boolean {
    return this.user.role === 'LEGAL' && c.status === 'PENDIENTE_FIRMA' && !this.hasSignature(c, 'LEGAL');
  }

  async sign(c: Contract): Promise<void> {
    const text = this.isClient()
      ? `¿Firmar digitalmente el contrato ${c.contractNumber}? Se registrará tu firma con un hash SHA-256 del documento.`
      : `¿Dar fe pública al contrato ${c.contractNumber}?`;
    if (!confirm(text)) return;
    this.busyId.set(c.id);
    try {
      const { signContract } = await this.graphql.request<{ signContract: { status: ContractStatus } }>(SIGN_CONTRACT, { id: c.id });
      notify(signContract.status === 'FIRMADO' ? `Contrato ${c.contractNumber} firmado por ambas partes.` : `Firma registrada en ${c.contractNumber}.`);
      this.selected.set(null);
      await this.load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      this.busyId.set(null);
    }
  }

  async openCreate(): Promise<void> {
    this.form = this.emptyForm();
    this.clausesEdited = false;
    this.formError.set('');
    this.showCreate.set(true);
    try {
      const data = await this.graphql.request<{ properties: PropertySummary[]; clients: Client[] }>(FORM_DATA_QUERY);
      this.properties.set(data.properties.filter((p) => p.status !== 'COMPRADO' && p.status !== 'VENDIDO'));
      this.clients.set(data.clients);
    } catch (err) {
      this.formError.set((err as Error).message);
    }
  }

  onPropertyChange(): void {
    const property = this.properties().find((p) => p.code === this.form.propertyId);
    if (property?.price && this.form.contractType === 'PROMESA_COMPRAVENTA') {
      this.form.totalAmount = property.price;
      this.form.downPayment = Math.round(property.price * 0.1);
    }
    this.refreshClauses();
  }

  refreshClauses(): void {
    if (!this.clausesEdited) this.form.legalClauses = this.buildClauses();
  }

  private buildClauses(): string {
    const property = this.properties().find((p) => p.code === this.form.propertyId);
    const client = this.clients().find((c) => c.id === this.form.clientId);
    const clientName = client?.name || '[cliente]';
    const propertyText = property ? `${property.title} (código ${property.code}), ubicado en ${property.zone || ''} ${property.city || ''}`.trim() : '[inmueble]';
    const total = this.form.totalAmount ?? 0;
    const down = this.form.downPayment ?? 0;
    if (this.form.contractType === 'ARRENDAMIENTO') {
      return [
        'CONTRATO DE ARRENDAMIENTO',
        `1. PARTES: Habitat Pro, en representación del propietario (ARRENDADOR), y ${clientName} (ARRENDATARIO).`,
        `2. OBJETO: El inmueble ${propertyText}.`,
        `3. CANON: USD ${total} mensuales, pagaderos del 1 al 5 de cada mes. Garantía: USD ${down}, devuelta al finalizar el contrato.`,
        '4. PLAZO: 12 meses, renovables por acuerdo escrito de ambas partes.',
        '5. USO: Exclusivamente habitacional. Prohibido subarrendar sin autorización escrita del arrendador.',
      ].join('\n');
    }
    return [
      'CONTRATO DE PROMESA DE COMPRAVENTA',
      `1. PARTES: Habitat Pro, en representación del propietario (VENDEDOR), y ${clientName} (COMPRADOR).`,
      `2. OBJETO: El inmueble ${propertyText}.`,
      `3. PRECIO: USD ${total}, con un anticipo de USD ${down} a la firma del presente contrato.`,
      '4. PLAZO: La escritura pública se otorgará dentro de los 30 días hábiles siguientes a la firma.',
      '5. INCUMPLIMIENTO: Si el comprador desiste, pierde el anticipo; si desiste el vendedor, lo devuelve duplicado.',
    ].join('\n');
  }

  async create(): Promise<void> {
    const property = this.properties().find((p) => p.code === this.form.propertyId);
    const client = this.clients().find((c) => c.id === this.form.clientId);
    if (!property || !client || !this.form.totalAmount) {
      this.formError.set('Selecciona inmueble y cliente, e indica el monto.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    try {
      const { createContract } = await this.graphql.request<{ createContract: { contractNumber: string } }>(CREATE_CONTRACT, {
        input: {
          propertyId: property.code,
          propertyTitle: property.title,
          clientId: client.id,
          clientName: client.name,
          contractType: this.form.contractType,
          totalAmount: Number(this.form.totalAmount),
          downPayment: Number(this.form.downPayment ?? 0),
          legalClauses: this.form.legalClauses,
        },
      });
      notify(`Contrato ${createContract.contractNumber} generado. Queda pendiente de firma del cliente y del Oficial Legal.`);
      this.showCreate.set(false);
      await this.load();
    } catch (err) {
      this.formError.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  openCancel(c: Contract): void {
    this.cancelReason = '';
    this.formError.set('');
    this.cancelTarget.set(c);
  }

  async confirmCancel(c: Contract): Promise<void> {
    this.saving.set(true);
    this.formError.set('');
    try {
      await this.graphql.request(CANCEL_CONTRACT, { id: c.id, reason: this.cancelReason });
      notify(`Contrato ${c.contractNumber} anulado.`);
      this.cancelTarget.set(null);
      await this.load();
    } catch (err) {
      this.formError.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private emptyForm(): ContractForm {
    return { propertyId: '', clientId: '', contractType: 'PROMESA_COMPRAVENTA', totalAmount: null, downPayment: null, legalClauses: '' };
  }
}
