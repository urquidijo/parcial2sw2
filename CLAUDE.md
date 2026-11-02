# Habitat Pro — guía para trabajar en el repo

Plataforma inmobiliaria con microservicios y microfrontends: ver `ARCHITECTURE.md` (arquitectura) y `PROGRESO_PLAN.md` (avance por casos de uso).

## Guía de diseño (UI)

Objetivo: que se vea como software empresarial sobrio (estilo Stripe o Linear), no como un prototipo generado.

### Reglas
- **Cero emojis en la interfaz**: ni en botones, menús, títulos, avisos ni opciones de `<select>`. Los íconos son de **Lucide** y salen siempre de `window.HabitatIcons`, que define el shell:
  - Shell (HTML/innerHTML): `<span data-icon="FileText"></span>` + `HabitatIcons.render()`, o `${HabitatIcons.html('FileText')}` en plantillas.
  - MFE React (`PropertyExplorer.js`, `mfe-bi.js`): componente `Icon({ name, size })` o `withIcon(name, label)`.
  - ERP Angular: `<erp-icon name="FileText" [size]="14" />` (`erp-icon.component.ts`).
  - Nombres en PascalCase de https://lucide.dev (ej. `CalendarCheck`, `Wallet`). Tamaño 14–16 px.
- **Un solo color de acento**: azul `--brand` (#1d4ed8) para acciones primarias, enlaces y foco. Base neutra zinc. Verde/ámbar/rojo **solo** en etiquetas de estado y montos (pagado, pendiente, cancelado).
- **Sin gradientes, sin sombras grandes, sin tarjetas dentro de tarjetas**. Separar con bordes de 1px (`var(--border)`) y espaciado. Sombra solo en modales y al pasar sobre una tarjeta.
- **Tipografía**: Plus Jakarta Sans. Títulos en 600; nada en 800. Evitar MAYÚSCULAS en etiquetas y encabezados de tabla.
- **Textos funcionales**: verbos concretos en botones ("Reservar", "Cobrar saldo", "Guardar cambios"); sin frases de marketing.
- **Sin jerga técnica para el usuario** (MongoDB, DynamoDB, saga, TTL, GraphQL…). Para mostrarle la arquitectura al docente existe el **modo demo**: `?demo=1` (se recuerda; `?demo=0` lo apaga) marca cada microfrontend con su tecnología. Lo técnico que deba verse solo en la demo va con la clase `demo-only`.

### Tokens y clases compartidas (definidas en `mfe-shell/index.html`)
Los microfrontends usan estas variables y clases: **no renombrarlas**.
- Variables: `--brand`, `--bg-page`, `--bg-card`, `--bg-alt`, `--text-main`, `--text-muted`, `--border`, `--radius`, `--emerald`, `--amber`, `--rose` (y sus `-light`).
- Botones: `.btn` (primario), `.btn-secondary`, `.btn-logout` (acción de riesgo, se pone roja al pasar). `.btn-emerald` / `.btn-indigo` / `.btn-brand` existen por compatibilidad y se ven igual que `.btn`.
- Datos: `.data-table` dentro de `.data-table-wrapper`; métricas en `.stat-strip` > `.stat` (`.label`, `.value`, `.sub`); estados con `.status-pill.ok|warn|bad|info`.
- Formularios y avisos: `.form-group`, `.form-control`, `.filter-select`, `.search-input`, `.filter-chip(.active)`, `.notice(.warn|.error)`, `.hint`.
- Modales: `.modal-backdrop.open` > `.modal-window` > `.modal-head` / `.modal-body` / `.modal-foot`; botón cerrar `.modal-close`; resumen `.summary-box`.
- La app BI separada (`mfe-bi-next/pages`) no hereda el CSS del shell: repite los mismos tokens en `pages/_app.js`.

### En tareas de diseño
No cambiar funcionalidad: se mantienen ids, `onclick`/handlers, eventos `habitat:*`, llamadas al API y lógica. Después del ERP Angular, recompilar con `npm run build` en `mfe-contracts-angular`.

## Reglas del equipo
- Los commits y los despliegues los hacen los integrantes; no hacer `git commit` ni `git push` sin que lo pidan.
- Las bases de datos (MongoDB Atlas, PostgreSQL en Render, DynamoDB) son compartidas en la nube: preguntar antes de cambiar datos o esquemas.
- Los secretos van en los `.env` (no versionados); en el repo solo `.env.example`.
