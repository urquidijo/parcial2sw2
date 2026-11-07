import Head from 'next/head';

// Mismos tokens y clases base que el shell (mfe-shell/index.html): diseño limpio y elevado.
export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Dashboard | Habitat Pro</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <style jsx global>{`
        :root {
          --bg-page: #f8fafc;
          --bg-card: #ffffff;
          --bg-alt: #f1f5f9;
          --text-main: #0f172a;
          --text-muted: #64748b;
          --text-light: #94a3b8;
          --brand: #2563eb;
          --brand-hover: #1d4ed8;
          --emerald: #047857;
          --emerald-light: #ecfdf5;
          --amber: #b45309;
          --amber-light: #fffbeb;
          --rose: #be123c;
          --rose-light: #fff1f2;
          --border: #e2e8f0;
          --border-strong: #cbd5e1;
          --shadow-sm: 0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04);
          --shadow-md: 0 12px 28px -6px rgb(15 23 42 / 0.1), 0 4px 10px -2px rgb(15 23 42 / 0.05);
          --radius: 12px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: var(--bg-page);
          color: var(--text-main);
          font-family: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', sans-serif;
          font-size: 14px;
          line-height: 1.45;
          -webkit-font-smoothing: antialiased;
        }
        h1, h2, h3 { font-weight: 700; letter-spacing: -0.015em; }
        a { color: var(--brand); text-decoration: none; font-weight: 600; }
        a:hover { text-decoration: underline; }

        .btn { background: var(--brand); color: #fff; border: 1px solid var(--brand); padding: 0.48rem 0.9rem; border-radius: 8px; font-family: inherit; font-size: 0.84rem; font-weight: 600; cursor: pointer; box-shadow: 0 1px 2px rgb(37 99 235 / 0.15); transition: all 0.15s ease; }
        .btn:hover { background: var(--brand-hover); transform: translateY(-1px); }
        .btn-secondary { background: var(--bg-card); color: var(--text-main); border-color: var(--border); box-shadow: 0 1px 2px rgb(15 23 42 / 0.04); }
        .btn-secondary:hover { background: var(--bg-alt); border-color: var(--border-strong); transform: translateY(-1px); }

        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
        .muted { color: var(--text-muted); }

        .stat-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 0.85rem; background: transparent; border: none; overflow: visible; }
        .stat { background: var(--bg-card); border: 1px solid var(--border); border-top: 3px solid #2563eb; border-radius: 12px; padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.18rem; margin-left: 0; box-shadow: var(--shadow-sm); transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .stat:nth-child(2) { border-top-color: #059669; }
        .stat:nth-child(3) { border-top-color: #d97706; }
        .stat:nth-child(4) { border-top-color: #6366f1; }
        .stat:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .stat .label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; }
        .stat .value { font-size: 1.42rem; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
        .stat .sub { font-size: 0.72rem; color: var(--text-light); font-weight: 500; }

        .data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.84rem; }
        .data-table th { background: #f8fafc; padding: 0.75rem 1rem; color: #475569; font-weight: 600; font-size: 0.73rem; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .data-table td { padding: 0.8rem 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tr:hover td { background: #f8fafc; }

        .status-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.18rem 0.6rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; background: var(--bg-alt); color: var(--text-muted); }
        .status-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .status-pill.ok { background: var(--emerald-light); color: var(--emerald); }
        .status-pill.bad { background: var(--rose-light); color: var(--rose); }
        .status-pill.warn { background: var(--amber-light); color: var(--amber); }
        .code { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; background: var(--bg-alt); border: 1px solid var(--border); padding: 0.12rem 0.45rem; border-radius: 6px; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
