import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { ErpRootComponent } from './app/erp-root.component';

// Sin zone.js: el estado vive en signals, así este microfrontend no parchea el navegador para el shell ni para React.
createApplication({ providers: [provideExperimentalZonelessChangeDetection(), provideHttpClient()] })
  .then((app) => {
    if (!customElements.get('mfe-contracts')) {
      customElements.define('mfe-contracts', createCustomElement(ErpRootComponent, { injector: app.injector }));
      console.log('✅ [Microfrontend Registrado]: <mfe-contracts> (Angular 18 + GraphQL)');
    }
  })
  .catch((err) => console.error('[mfe-contracts-angular] No se pudo iniciar:', err));
