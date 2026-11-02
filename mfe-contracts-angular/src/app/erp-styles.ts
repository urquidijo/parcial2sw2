// Estilos del ERP con prefijo erp-; botones, tablas, formularios, modales e íconos reutilizan las clases y variables del shell.
export const ERP_STYLES = `
  .erp-root { display: block; }
  .erp-toolbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .erp-toolbar h2 { font-size: 1.2rem; font-weight: 600; }
  .erp-toolbar p { font-size: 0.84rem; color: var(--text-muted); margin-top: 0.15rem; }
  .erp-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .erp-row-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .erp-row-actions .btn, .erp-row-actions .btn-logout { padding: 0.3rem 0.6rem; font-size: 0.78rem; }
  .erp-empty { padding: 2.5rem; text-align: center; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-muted); }
  .erp-error { background: var(--rose-light); border: 1px solid #fecdd3; color: var(--rose); border-radius: 6px; padding: 0.65rem 0.85rem; font-size: 0.82rem; margin-bottom: 0.8rem; }
  .erp-hint { display: flex; align-items: center; gap: 0.5rem; background: var(--bg-alt); border: 1px solid var(--border); color: var(--text-main); border-radius: 6px; padding: 0.6rem 0.85rem; font-size: 0.82rem; margin-bottom: 0.8rem; }
  .erp-hint .icon { color: var(--text-muted); }
  .erp-status { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 500; white-space: nowrap; background: var(--bg-alt); color: var(--text-muted); }
  .erp-status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .erp-status.ok { background: var(--emerald-light); color: var(--emerald); }
  .erp-status.warn { background: var(--amber-light); color: var(--amber); }
  .erp-status.off { background: var(--bg-alt); color: var(--text-muted); }
  .erp-status.bad { background: var(--rose-light); color: var(--rose); }
  .erp-muted { color: var(--text-muted); font-size: 0.78rem; }
  .erp-gap-top { margin-top: 0.4rem; }
  .erp-text { font-size: 0.86rem; }
  .erp-code { font-family: 'JetBrains Mono', monospace; font-size: 0.74rem; background: var(--bg-alt); color: var(--text-main); padding: 0.1rem 0.4rem; border-radius: 4px; }
  .erp-inline { display: inline-flex; align-items: center; gap: 0.4rem; }
  .erp-notes { max-width: 220px; color: var(--text-muted); }
  .erp-section-title { font-weight: 600; font-size: 0.88rem; }
  .erp-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
  .erp-grid-2 strong { font-weight: 600; }
  .erp-clauses { background: #fafafa; border: 1px solid var(--border); border-radius: 6px; padding: 0.9rem; font-family: 'JetBrains Mono', monospace; font-size: 0.76rem; line-height: 1.6; white-space: pre-wrap; max-height: 260px; overflow-y: auto; }
  .erp-signature { display: flex; justify-content: space-between; gap: 0.75rem; border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; font-size: 0.82rem; margin-top: 0.5rem; }
  .erp-hash { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: var(--text-muted); word-break: break-all; }
  @media (max-width: 640px) { .erp-grid-2 { grid-template-columns: 1fr; } }
`;
