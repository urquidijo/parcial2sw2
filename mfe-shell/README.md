# Microfrontend Shell Container (Host)

- **Tecnología:** TypeScript + Webpack 5 Module Federation + TailwindCSS / Vanilla CSS
- **Puerto por defecto:** 3000
- **Responsabilidad:**
  - Shell orquestador que carga bajo demanda los microfrontends remotos.
  - Implementación del adaptador de SSO con **Keycloak JS (OIDC / PKCE)**.
  - Gestión de layout principal, navegación y barra de estado de autenticación.
  - Bus de eventos global para intercambio de contexto entre MFEs.

## Remotos Federados:
- `mfe_properties`: Catálogo de propiedades (React) en `http://localhost:3001`
- `mfe_contracts`: ERP Contractual y Notarial (Angular) en `http://localhost:3002`
- `mfe_bi`: Dashboard de Inteligencia de Negocios (Vue) en `http://localhost:3003`
