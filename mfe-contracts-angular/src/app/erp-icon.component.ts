import { Component, ElementRef, Input, OnChanges, inject } from '@angular/core';

interface IconProvider {
  HabitatIcons?: { el(name: string, size?: number): SVGElement | null };
}

// <erp-icon name="FileText" />: ícono de Lucide que provee el shell (window.HabitatIcons). Sin el shell no muestra nada.
@Component({
  selector: 'erp-icon',
  standalone: true,
  template: '',
  host: { class: 'icon', 'aria-hidden': 'true' },
})
export class ErpIconComponent implements OnChanges {
  @Input({ required: true }) name!: string;
  @Input() size = 16;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngOnChanges(): void {
    const svg = (window as unknown as IconProvider).HabitatIcons?.el(this.name, this.size) ?? null;
    this.host.nativeElement.replaceChildren(...(svg ? [svg] : []));
  }
}
