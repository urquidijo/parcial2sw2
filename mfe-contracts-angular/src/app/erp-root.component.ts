import { Component, Input, OnDestroy, OnInit, ViewEncapsulation, signal } from '@angular/core';
import { AgendaViewComponent } from './agenda-view.component';
import { ContractsViewComponent } from './contracts-view.component';
import { EmployeesViewComponent } from './employees-view.component';
import { ERP_STYLES } from './erp-styles';
import { HabitatUser, currentUser } from './habitat-bridge';

type ErpView = 'contratos' | 'empleados' | 'agenda';

// <mfe-contracts view="contratos|empleados|agenda">: el shell coloca una instancia en cada sección del ERP.
@Component({
  selector: 'erp-root',
  standalone: true,
  imports: [ContractsViewComponent, EmployeesViewComponent, AgendaViewComponent],
  encapsulation: ViewEncapsulation.None,
  styles: [ERP_STYLES],
  template: `
    <div class="erp-root">
      @if (user(); as u) {
        @switch (view()) {
          @case ('empleados') { <erp-employees [user]="u" [refreshKey]="refreshKey()" /> }
          @case ('agenda') { <erp-agenda [user]="u" [refreshKey]="refreshKey()" /> }
          @default { <erp-contracts [user]="u" [refreshKey]="refreshKey()" /> }
        }
      } @else {
        <div class="erp-empty">Inicia sesión para ver esta sección.</div>
      }
    </div>
  `,
})
export class ErpRootComponent implements OnInit, OnDestroy {
  readonly view = signal<ErpView>('contratos');
  readonly user = signal<HabitatUser | null>(currentUser());
  readonly refreshKey = signal(0);

  @Input('view')
  set viewAttribute(value: string) {
    this.view.set(value === 'empleados' || value === 'agenda' ? value : 'contratos');
  }

  // El shell dispara este evento al iniciar sesión (sin detalle: refrescan todas) y al entrar a una sección (detail.view).
  private readonly onRefresh = (event: Event) => {
    const view = (event as CustomEvent<{ view?: string } | null>).detail?.view;
    if (view && view !== this.view()) return;
    this.user.set(currentUser());
    this.refreshKey.update((k) => k + 1);
  };

  ngOnInit(): void {
    window.addEventListener('habitat:refresh:contracts', this.onRefresh);
  }

  ngOnDestroy(): void {
    window.removeEventListener('habitat:refresh:contracts', this.onRefresh);
  }
}
