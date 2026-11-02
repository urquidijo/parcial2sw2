import { Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ErpIconComponent } from './erp-icon.component';
import { GraphqlService } from './graphql.service';
import { HabitatUser, notify } from './habitat-bridge';
import { Appointment, AppointmentStatus } from './models';

const APPOINTMENTS_QUERY = `query Agenda {
  appointments { id propertyId propertyTitle clientName clientPhone visitDate visitTime visitType notes status property { title zone city } }
}`;
const UPDATE_STATUS = `mutation UpdateVisit($id: ID!, $status: AppointmentStatus!) { updateAppointmentStatus(id: $id, status: $status) { id status } }`;

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  CONFIRMADA: 'Confirmada',
  COMPLETADA: 'Realizada',
  CANCELADA: 'Cancelada',
};

type AgendaFilter = 'PROXIMAS' | 'TODAS' | AppointmentStatus;

// CU09 (el cliente ve y cancela sus visitas) y CU10 (el agente gestiona la agenda completa).
@Component({
  selector: 'erp-agenda',
  standalone: true,
  imports: [FormsModule, ErpIconComponent],
  template: `
    <div class="erp-toolbar">
      <div>
        <h2>{{ isClient() ? 'Mis visitas' : 'Agenda de visitas' }}</h2>
        <p>{{ isClient() ? 'Tus visitas agendadas a inmuebles.' : 'Visitas presenciales y virtuales agendadas por los clientes.' }}</p>
      </div>
      <div class="erp-actions">
        <select class="filter-select" [ngModel]="filter()" (ngModelChange)="filter.set($event)">
          <option value="PROXIMAS">Próximas</option>
          <option value="TODAS">Todas</option>
          <option value="CONFIRMADA">Confirmadas</option>
          <option value="COMPLETADA">Realizadas</option>
          <option value="CANCELADA">Canceladas</option>
        </select>
        <button class="btn btn-secondary" type="button" (click)="load()"><erp-icon name="RefreshCw" [size]="14" />Actualizar</button>
      </div>
    </div>

    @if (isClient()) {
      <div class="erp-hint"><erp-icon name="Info" [size]="14" />Para agendar una visita, abre un inmueble del catálogo y pulsa "Agendar visita".</div>
    }
    @if (error()) { <div class="erp-error">{{ error() }}</div> }

    @if (loading()) {
      <div class="erp-empty">Cargando la agenda…</div>
    } @else if (visible().length === 0) {
      <div class="erp-empty">No hay visitas para mostrar.</div>
    } @else {
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Fecha y hora</th><th>Inmueble</th>
              @if (!isClient()) { <th>Cliente</th> }
              <th>Modalidad</th><th>Notas</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (a of visible(); track a.id) {
              <tr>
                <td><strong>{{ formatDate(a.visitDate) }}</strong><div class="erp-muted">{{ a.visitTime }} · {{ a.id }}</div></td>
                <td>{{ a.property?.title || a.propertyTitle }}<div class="erp-muted">{{ a.property ? a.property.zone + ', ' + a.property.city : '' }}</div></td>
                @if (!isClient()) { <td>{{ a.clientName }}<div class="erp-muted">{{ a.clientPhone }}</div></td> }
                <td><span class="erp-inline"><erp-icon [name]="a.visitType === 'VIRTUAL_3D' ? 'Video' : 'Footprints'" [size]="14" />{{ a.visitType === 'VIRTUAL_3D' ? 'Virtual' : 'Presencial' }}</span></td>
                <td class="erp-notes">{{ a.notes || '—' }}</td>
                <td><span class="erp-status" [class]="statusClass(a.status)">{{ statusLabels[a.status] }}</span></td>
                <td>
                  <div class="erp-row-actions">
                    @if (a.status === 'CONFIRMADA' && canManage()) {
                      <button class="btn btn-secondary" type="button" [disabled]="busyId() === a.id" (click)="update(a, 'COMPLETADA')"><erp-icon name="Check" [size]="14" />Realizada</button>
                    }
                    @if (a.status === 'CONFIRMADA' && (canManage() || isClient())) {
                      <button class="btn-logout" type="button" [disabled]="busyId() === a.id" (click)="update(a, 'CANCELADA')">Cancelar</button>
                    }
                    @if (a.status !== 'CONFIRMADA' || (!canManage() && !isClient())) { <span class="erp-muted">—</span> }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AgendaViewComponent implements OnChanges {
  @Input({ required: true }) user!: HabitatUser;
  @Input() refreshKey = 0;

  private readonly graphql = inject(GraphqlService);

  readonly statusLabels = STATUS_LABELS;
  readonly appointments = signal<Appointment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busyId = signal<string | null>(null);
  readonly filter = signal<AgendaFilter>('PROXIMAS');

  readonly visible = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    const key = (a: Appointment) => `${a.visitDate} ${a.visitTime}`;
    const filter = this.filter();
    let list = this.appointments();
    if (filter === 'PROXIMAS') list = list.filter((a) => a.visitDate >= today && a.status === 'CONFIRMADA');
    else if (filter !== 'TODAS') list = list.filter((a) => a.status === filter);
    return [...list].sort((a, b) => (filter === 'PROXIMAS' ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))));
  });

  isClient = () => this.user.role === 'CLIENTE';
  canManage = () => this.user.role === 'AGENTE' || this.user.role === 'ADMIN';

  ngOnChanges(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.appointments.set((await this.graphql.request<{ appointments: Appointment[] }>(APPOINTMENTS_QUERY)).appointments);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  statusClass(status: AppointmentStatus): string {
    if (status === 'COMPLETADA') return 'erp-status ok';
    if (status === 'CONFIRMADA') return 'erp-status warn';
    return 'erp-status off';
  }

  formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-BO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  async update(appointment: Appointment, status: AppointmentStatus): Promise<void> {
    if (status === 'CANCELADA' && !confirm(`¿Cancelar la visita del ${this.formatDate(appointment.visitDate)} a las ${appointment.visitTime}?`)) return;
    this.busyId.set(appointment.id);
    try {
      await this.graphql.request(UPDATE_STATUS, { id: appointment.id, status });
      notify(`Visita ${appointment.id} marcada como ${STATUS_LABELS[status].toLowerCase()}.`);
      await this.load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      this.busyId.set(null);
    }
  }
}
