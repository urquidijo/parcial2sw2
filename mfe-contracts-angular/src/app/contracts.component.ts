import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-contracts-mfe',
  template: `
    <div class="contracts-erp-container">
      <h2>Módulo ERP Contractual y Notarial (Angular 17)</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Contrato</th>
            <th>Propiedad</th>
            <th>Titular</th>
            <th>Monto</th>
            <th>Estado</th>
            <th>Firma Digital</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let c of contracts">
            <td><strong>{{ c.id }}</strong></td>
            <td>{{ c.property_title }}</td>
            <td>{{ c.user_name }}</td>
            <td>\${{ c.total_amount | number }} USD</td>
            <td>{{ c.status }}</td>
            <td>{{ c.signed_by || 'Pendiente' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `
})
export class ContractsComponent implements OnInit {
  contracts: any[] = [];

  ngOnInit() {
    fetch('http://localhost:5000/api/contracts')
      .then(res => res.json())
      .then(data => {
        if (data.success) this.contracts = data.data;
      });
  }
}
