# mfe-contracts-angular — ERP (Angular 18 + Angular Elements + GraphQL)

Microfrontend del Sistema de Gestión Empresarial. Se publica como Web Component `<mfe-contracts>` y el shell coloca una instancia por sección:

| Atributo `view` | Caso de uso | Quién lo usa |
|---|---|---|
| `contratos` | CU11 generar / anular contrato · CU12 firmar | Cliente (sus contratos), Oficial Legal, Admin |
| `empleados` | CU08 alta, baja y sector de empleados | Administrador General |
| `agenda` | CU09 mis visitas · CU10 agenda del agente | Cliente, Agente, Admin |

- Todas las vistas consultan el **BFF GraphQL** (`/api/graphql` → `bff-graphql-gateway`) con el token de Keycloak del shell.
- Sin zone.js (modo zoneless con signals) para no interferir con el shell ni con el microfrontend React.

## Compilar

```bash
npm install
npm run build        # genera dist/browser/main.js (módulo ES)
```

El shell carga `/mfe/contracts/dist/browser/main.js` en local. `start-all.ps1` lo compila si falta `dist/`.
