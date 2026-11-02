import Head from 'next/head';

// Mismos tokens y clases base que el shell (mfe-shell/index.html): base zinc, un solo acento azul, bordes de 1px.
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
          --bg-page: #fafafa;
          --bg-card: #ffffff;
          --bg-alt: #f4f4f5;
          --text-main: #18181b;
          --text-muted: #71717a;
          --text-light: #a1a1aa;
          --brand: #1d4ed8;
          --brand-hover: #1e40af;
          --emerald: #047857;
          --emerald-light: #ecfdf5;
          --amber: #b45309;
          --amber-light: #fffbeb;
          --rose: #be123c;
          --rose-light: #fff1f2;
          --border: #e4e4e7;
          --border-strong: #d4d4d8;
          --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.04);
          --radius: 8px;
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
        h1, h2, h3 { font-weight: 600; letter-spacing: -0.01em; }
        a { color: var(--brand); text-decoration: none; font-weight: 500; }
        a:hover { text-decoration: underline; }

        .btn { background: var(--brand); color: #fff; border: 1px solid var(--brand); padding: 0.45rem 0.85rem; border-radius: 6px; font-family: inherit; font-size: 0.84rem; font-weight: 500; cursor: pointer; }
        .btn:hover { background: var(--brand-hover); }
        .btn-secondary { background: var(--bg-card); color: var(--text-main); border-color: var(--border); }
        .btn-secondary:hover { background: var(--bg-alt); border-color: var(--border-strong); }

        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); }
        .muted { color: var(--text-muted); }

        .stat-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .stat { padding: 0.85rem 1.1rem; display: flex; flex-direction: column; gap: 0.15rem; border-left: 1px solid var(--border); margin-left: -1px; }
        .stat .label { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }
        .stat .value { font-size: 1.3rem; font-weight: 600; font-variant-numeric: tabular-nums; }
        .stat .sub { font-size: 0.72rem; color: var(--text-light); }

        .data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.84rem; }
        .data-table th { background: #fafafa; padding: 0.6rem 1rem; color: var(--text-muted); font-weight: 500; font-size: 0.76rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .data-table td { padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); vertical-align: top; }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tr:hover td { background: #fafafa; }

        .status-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 500; white-space: nowrap; background: var(--bg-alt); color: var(--text-muted); }
        .status-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .status-pill.ok { background: var(--emerald-light); color: var(--emerald); }
        .status-pill.bad { background: var(--rose-light); color: var(--rose); }
        .code { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; background: var(--bg-alt); padding: 0.1rem 0.4rem; border-radius: 4px; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
