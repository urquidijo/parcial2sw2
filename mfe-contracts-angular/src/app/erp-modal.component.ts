import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ErpIconComponent } from './erp-icon.component';

@Component({
  selector: 'erp-modal',
  standalone: true,
  imports: [ErpIconComponent],
  template: `
    <div class="modal-backdrop open" (click)="onBackdrop($event)">
      <div class="modal-window" [style.max-width.px]="maxWidth">
        <div class="modal-head">
          <h3>{{ title }}</h3>
          <button class="modal-close" type="button" aria-label="Cerrar" (click)="closed.emit()"><erp-icon name="X" [size]="18" /></button>
        </div>
        <div class="modal-body"><ng-content /></div>
        <div class="modal-foot"><ng-content select="[modal-footer]" /></div>
      </div>
    </div>
  `,
})
export class ErpModalComponent {
  @Input() title = '';
  @Input() maxWidth = 620;
  @Output() closed = new EventEmitter<void>();

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
