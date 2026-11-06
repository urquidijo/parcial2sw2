import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ErpIconComponent } from './erp-icon.component';
import { ErpModalComponent } from './erp-modal.component';
import { GraphqlService } from './graphql.service';
import { HabitatUser, notify } from './habitat-bridge';
import { Employee, SECTOR_LABELS, Sector } from './models';

const EMPLOYEE_FIELDS = 'id name email sector active createdAt telegramLinked telegramAlerts';
const EMPLOYEES_QUERY = `query Employees { employees { ${EMPLOYEE_FIELDS} } }`;
const CREATE_EMPLOYEE = `mutation CreateEmployee($input: CreateEmployeeInput!) { createEmployee(input: $input) { ${EMPLOYEE_FIELDS} } }`;
const UPDATE_SECTOR = `mutation UpdateSector($id: ID!, $sector: Sector!) { updateEmployeeSector(id: $id, sector: $sector) { id sector } }`;
const SET_ALERTS = `mutation SetAlerts($id: ID!, $enabled: Boolean!) { setEmployeeTelegramAlerts(id: $id, enabled: $enabled) { id telegramAlerts } }`;
const SET_ACTIVE = `mutation SetActive($id: ID!, $active: Boolean!) { setEmployeeActive(id: $id, active: $active) { id active } }`;

interface EmployeeForm {
  firstName: string;
  lastName: string;
  email: string;
  sector: Sector;
  temporaryPassword: string;
}

@Component({
  selector: 'erp-employees',
  standalone: true,
  imports: [FormsModule, ErpModalComponent, ErpIconComponent, DatePipe],
  template: `
    <div class="erp-toolbar">
      <div>
        <h2>Empleados</h2>
        <p>Alta, baja y sector de cada empleado. La cuenta sirve para el portal, el dashboard y la app móvil.</p>
      </div>
      <div class="erp-actions">
        <button class="btn btn-secondary" type="button" (click)="load()"><erp-icon name="RefreshCw" [size]="14" />Actualizar</button>
        @if (isAdmin()) {
          <button class="btn" type="button" (click)="openCreate()"><erp-icon name="UserPlus" [size]="14" />Nuevo empleado</button>
        }
      </div>
    </div>

    @if (!isAdmin()) {
      <div class="erp-empty">Solo el Administrador General gestiona empleados.</div>
    } @else {
      @if (error()) { <div class="erp-error">{{ error() }}</div> }
      @if (loading()) {
        <div class="erp-empty">Cargando empleados…</div>
      } @else if (employees().length === 0) {
        <div class="erp-empty">Aún no hay empleados registrados.</div>
      } @else {
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead><tr><th>Empleado</th><th>Sector</th><th>Estado</th><th>Telegram</th><th>Recibe alertas</th><th>Alta</th><th>Acciones</th></tr></thead>
            <tbody>
              @for (e of employees(); track e.id) {
                <tr>
                  <td><strong>{{ e.name }}</strong><div class="erp-muted">{{ e.email }}</div></td>
                  <td>
                    <select class="filter-select" [ngModel]="e.sector" [disabled]="busyId() === e.id || !e.active" (ngModelChange)="changeSector(e, $event)">
                      @for (s of sectors; track s) { <option [value]="s">{{ sectorLabels[s] }}</option> }
                    </select>
                  </td>
                  <td><span class="erp-status" [class]="e.active ? 'erp-status ok' : 'erp-status off'">{{ e.active ? 'Activo' : 'Dado de baja' }}</span></td>
                  <td>
                    @if (e.telegramLinked) {
                      <span class="erp-inline"><erp-icon name="CircleCheck" [size]="14" />Vinculado</span>
                    } @else {
                      <span class="erp-muted" title="El empleado debe pulsar 'Conectar Telegram' en su cuenta">Sin vincular</span>
                    }
                  </td>
                  <td>
                    <label class="erp-inline" [title]="e.telegramLinked ? 'Recibe el resumen del agente monitor' : 'Primero debe vincular su Telegram'">
                      <input type="checkbox" [checked]="e.telegramAlerts" [disabled]="!e.telegramLinked || !e.active || busyId() === e.id" (change)="setAlerts(e, $any($event.target).checked)">
                      {{ e.telegramAlerts ? 'Sí' : 'No' }}
                    </label>
                  </td>
                  <td>{{ e.createdAt | date: 'dd/MM/yyyy' }}</td>
                  <td>
                    <div class="erp-row-actions">
                      @if (e.active) {
                        <button class="btn-logout" type="button" [disabled]="busyId() === e.id" (click)="setActive(e, false)">Dar de baja</button>
                      } @else {
                        <button class="btn btn-secondary" type="button" [disabled]="busyId() === e.id" (click)="setActive(e, true)">Reactivar</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }

    @if (showCreate()) {
      <erp-modal title="Nuevo empleado" (closed)="showCreate.set(false)">
        @if (formError()) { <div class="erp-error">{{ formError() }}</div> }
        <div class="erp-grid-2">
          <div class="form-group"><label>Nombre *</label><input class="form-control" maxlength="50" [(ngModel)]="form.firstName"></div>
          <div class="form-group"><label>Apellido *</label><input class="form-control" maxlength="50" [(ngModel)]="form.lastName"></div>
        </div>
        <div class="form-group"><label>Email (será su usuario) *</label><input class="form-control" type="email" [(ngModel)]="form.email"></div>
        <div class="form-group">
          <label>Sector *</label>
          <select class="form-control" [(ngModel)]="form.sector">
            @for (s of sectors; track s) { <option [value]="s">{{ sectorLabels[s] }}</option> }
          </select>
        </div>
        <div class="form-group">
          <label>Contraseña temporal * (deberá cambiarla en su primer inicio de sesión)</label>
          <div class="erp-inline">
            <input class="form-control" [(ngModel)]="form.temporaryPassword">
            <button class="btn btn-secondary" type="button" (click)="generatePassword()">Generar</button>
          </div>
        </div>
        <div modal-footer>
          <button class="btn btn-secondary" type="button" (click)="showCreate.set(false)">Cancelar</button>
          <button class="btn" type="button" [disabled]="saving()" (click)="create()">{{ saving() ? 'Creando…' : 'Crear empleado' }}</button>
        </div>
      </erp-modal>
    }
  `,
})
export class EmployeesViewComponent implements OnChanges {
  @Input({ required: true }) user!: HabitatUser;
  @Input() refreshKey = 0;

  private readonly graphql = inject(GraphqlService);

  readonly sectors = Object.keys(SECTOR_LABELS) as Sector[];
  readonly sectorLabels = SECTOR_LABELS;
  readonly employees = signal<Employee[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busyId = signal<string | null>(null);
  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly formError = signal('');
  form: EmployeeForm = this.emptyForm();

  isAdmin = () => this.user.role === 'ADMIN';

  ngOnChanges(): void {
    if (this.isAdmin()) this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.employees.set((await this.graphql.request<{ employees: Employee[] }>(EMPLOYEES_QUERY)).employees);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async changeSector(employee: Employee, sector: Sector): Promise<void> {
    if (sector === employee.sector) return;
    this.busyId.set(employee.id);
    try {
      await this.graphql.request(UPDATE_SECTOR, { id: employee.id, sector });
      notify(`${employee.name} ahora es ${SECTOR_LABELS[sector]}. El cambio aplica en su próximo inicio de sesión.`);
      await this.load();
    } catch (err) {
      alert((err as Error).message);
      await this.load();
    } finally {
      this.busyId.set(null);
    }
  }

  // CU21: quién recibe por Telegram el resumen del agente monitor.
  async setAlerts(employee: Employee, enabled: boolean): Promise<void> {
    this.busyId.set(employee.id);
    try {
      await this.graphql.request(SET_ALERTS, { id: employee.id, enabled });
      notify(enabled ? `${employee.name} recibirá las alertas del monitor por Telegram.` : `${employee.name} ya no recibirá las alertas.`);
      await this.load();
    } catch (err) {
      alert((err as Error).message);
      await this.load();
    } finally {
      this.busyId.set(null);
    }
  }

  async setActive(employee: Employee, active: boolean): Promise<void> {
    const question = active
      ? `¿Reactivar la cuenta de ${employee.name}?`
      : `¿Dar de baja a ${employee.name}? No podrá iniciar sesión y se cerrarán sus sesiones abiertas.`;
    if (!confirm(question)) return;
    this.busyId.set(employee.id);
    try {
      await this.graphql.request(SET_ACTIVE, { id: employee.id, active });
      notify(active ? `${employee.name} fue reactivado.` : `${employee.name} fue dado de baja.`);
      await this.load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      this.busyId.set(null);
    }
  }

  openCreate(): void {
    this.form = this.emptyForm();
    this.formError.set('');
    this.showCreate.set(true);
  }

  generatePassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const random = crypto.getRandomValues(new Uint32Array(10));
    this.form.temporaryPassword = Array.from(random, (n) => chars[n % chars.length]).join('');
  }

  async create(): Promise<void> {
    this.saving.set(true);
    this.formError.set('');
    try {
      const { createEmployee } = await this.graphql.request<{ createEmployee: Employee }>(CREATE_EMPLOYEE, { input: { ...this.form } });
      notify(`${createEmployee.name} creado. Comparte su usuario (${createEmployee.email}) y la contraseña temporal.`);
      this.showCreate.set(false);
      await this.load();
    } catch (err) {
      this.formError.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private emptyForm(): EmployeeForm {
    return { firstName: '', lastName: '', email: '', sector: 'AGENTE', temporaryPassword: '' };
  }
}
