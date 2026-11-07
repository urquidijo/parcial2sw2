// Estilos del ERP con prefijo erp-; botones, tablas, formularios, modales e íconos reutilizan las clases y variables del shell.
export const ERP_STYLES = `
  .erp-root { display: block; }
  .erp-toolbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.15rem; background: #ffffff; border: 1px solid var(--border); border-radius: 12px; padding: 1.1rem 1.35rem; box-shadow: var(--shadow-sm); }
  .erp-toolbar h2 { font-size: 1.22rem; font-weight: 700; color: var(--text-main); letter-spacing: -0.015em; }
  .erp-toolbar p { font-size: 0.84rem; color: var(--text-muted); margin-top: 0.2rem; }
  .erp-actions { display: flex; gap: 0.55rem; align-items: center; flex-wrap: wrap; }
  .erp-row-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
  .erp-row-actions .btn, .erp-row-actions .btn-logout { padding: 0.35rem 0.68rem; font-size: 0.78rem; border-radius: 7px; }
  .erp-empty { padding: 3rem 2rem; text-align: center; background: var(--bg-card); border: 1px dashed var(--border-strong); border-radius: 12px; color: var(--text-muted); font-size: 0.9rem; box-shadow: var(--shadow-sm); }
  .erp-error { background: var(--rose-light); border: 1px solid #fecdd3; color: var(--rose); border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.84rem; margin-bottom: 0.9rem; font-weight: 500; }
  .erp-hint { display: flex; align-items: center; gap: 0.55rem; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; border-radius: 10px; padding: 0.7rem 1rem; font-size: 0.83rem; margin-bottom: 0.9rem; }
  .erp-hint .icon { color: var(--brand); }
  .erp-status { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.73rem; font-weight: 600; white-space: nowrap; background: var(--bg-alt); color: var(--text-muted); border: 1px solid transparent; }
  .erp-status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .erp-status.ok { background: var(--emerald-light); color: var(--emerald); border-color: #a7f3d0; }
  .erp-status.warn { background: var(--amber-light); color: var(--amber); border-color: #fde68a; }
  .erp-status.off { background: var(--bg-alt); color: var(--text-muted); border-color: var(--border); }
  .erp-status.bad { background: var(--rose-light); color: var(--rose); border-color: #fecdd3; }
  .erp-muted { color: var(--text-muted); font-size: 0.78rem; }
  .erp-gap-top { margin-top: 0.4rem; }
  .erp-text { font-size: 0.86rem; }
  .erp-code { font-family: 'JetBrains Mono', monospace; font-size: 0.74rem; background: #f1f5f9; border: 1px solid #e2e8f0; color: var(--text-main); padding: 0.15rem 0.48rem; border-radius: 6px; font-weight: 500; }
  .erp-inline { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 500; }
  .erp-notes { max-width: 240px; color: var(--text-muted); }
  .erp-section-title { font-weight: 600; font-size: 0.9rem; color: var(--text-main); }
  .erp-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; }
  .erp-grid-2 strong { font-weight: 600; }
  .erp-clauses { background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-family: 'JetBrains Mono', monospace; font-size: 0.76rem; line-height: 1.65; white-space: pre-wrap; max-height: 260px; overflow-y: auto; }
  .erp-signature { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; background: #f8fafc; border: 1px solid var(--border); border-left: 3px solid var(--emerald); border-radius: 8px; padding: 0.7rem 0.9rem; font-size: 0.82rem; margin-top: 0.55rem; }
  .erp-hash { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: var(--text-muted); word-break: break-all; margin-top: 0.15rem; }
  @media (max-width: 640px) { .erp-grid-2 { grid-template-columns: 1fr; } }
`;
