/**
 * CU05 — Asistente que guía por el sistema (cliente y empleados).
 *
 * 1. Sin conexión: busca la respuesta en las preguntas frecuentes de su rol con MiniLM (transformers.js,
 *    corre en el navegador; el modelo de ~23 MB se descarga la primera vez y queda guardado) + palabras clave.
 * 2. Si no la encuentra, ofrece "Preguntar al asistente IA" (Claude Haiku en el gateway), solo con conexión
 *    y solo si el usuario lo pide.
 * Cada respuesta trae un botón que lleva a la pantalla correcta.
 */
(function () {
  const BASE = '/assistant/';
  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
  const DIRECT = 0.45;   // responde directo
  const SUGGEST = 0.36;  // "¿Te refieres a…?"  (umbrales medidos con tools/faq-embeddings: npm run eval)
  const VIEW_TABS = { catalogo: 'tabCatalogo', citas: 'tabCitas', reservas: 'tabReservas', contratos: 'tabContratos', finanzas: 'tabFinanzas', usuarios: 'tabUsuarios', ai: 'tabAI', segmentos: 'tabSegmentos' };
  const M = () => window.HabitatAssistantMatcher;

  let prepared = null;   // FAQ + vectores
  let embedder = null;   // pipeline de MiniLM
  let modelState = 'idle'; // idle | loading | ready | error
  let panel, list, input, fab;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => (window.currentUserReady && window.currentUserReady() ? currentUser.role : 'CLIENTE');

  async function loadFaq() {
    if (prepared) return prepared;
    const [faq, emb] = await Promise.all([
      fetch(BASE + 'faq.json').then((r) => r.json()),
      fetch(BASE + 'faq.embeddings.json').then((r) => r.json()).catch(() => null),
    ]);
    prepared = { faq, emb, entries: M().prepare(faq, emb) };
    return prepared;
  }

  // El modelo se carga en segundo plano: mientras tanto el asistente responde con palabras clave.
  async function loadModel() {
    if (modelState !== 'idle') return;
    modelState = 'loading';
    setStatus('Preparando la ayuda sin conexión (solo la primera vez)…');
    try {
      const { pipeline, env } = await import(TRANSFORMERS_URL);
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      embedder = await pipeline('feature-extraction', prepared?.emb?.model || 'Xenova/all-MiniLM-L6-v2', { dtype: prepared?.emb?.dtype || 'q8' });
      modelState = 'ready';
      setStatus('');
    } catch (err) {
      console.warn('[asistente] No se pudo cargar el modelo; se usan palabras clave.', err);
      modelState = 'error';
      setStatus('');
    }
  }

  async function vectorOf(text) {
    if (!embedder) return null;
    const out = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  }

  // ---------------- interfaz ----------------
  function build() {
    if (panel) return;
    fab = document.createElement('button');
    fab.className = 'help-fab hidden';
    fab.id = 'helpFab';
    fab.setAttribute('aria-label', 'Ayuda');
    fab.innerHTML = `${HabitatIcons.html('CircleHelp', 18)}<span>Ayuda</span>`;
    fab.onclick = () => toggle();
    document.body.appendChild(fab);

    panel = document.createElement('section');
    panel.className = 'help-panel hidden';
    panel.setAttribute('aria-label', 'Asistente de ayuda');
    panel.innerHTML = `
      <div class="help-head">
        <div><strong>Ayuda</strong><div class="hint" id="helpStatus"></div></div>
        <button class="modal-close" aria-label="Cerrar">${HabitatIcons.html('X', 18)}</button>
      </div>
      <div class="help-list" id="helpList" aria-live="polite"></div>
      <form class="help-form" id="helpForm">
        <input class="form-control" id="helpInput" placeholder="¿Qué necesitas hacer?" autocomplete="off" maxlength="400">
        <button type="button" class="btn-logout help-mic hidden" id="helpMic" aria-label="Dictar">${HabitatIcons.html('Mic', 16)}</button>
        <button class="btn" type="submit" aria-label="Enviar">${HabitatIcons.html('SendHorizontal', 16)}</button>
      </form>`;
    document.body.appendChild(panel);
    panel.querySelector('.modal-close').onclick = () => toggle(false);
    list = panel.querySelector('#helpList');
    input = panel.querySelector('#helpInput');
    panel.querySelector('#helpForm').onsubmit = (e) => { e.preventDefault(); ask(input.value); };
    setupVoice();
  }

  function setStatus(text) {
    const el = document.getElementById('helpStatus');
    if (el) el.textContent = text;
  }

  function add(html, who = 'bot') {
    const div = document.createElement('div');
    div.className = `help-msg ${who}`;
    div.innerHTML = html;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return div;
  }

  function actionButton(accion) {
    if (!accion) return '';
    if (accion.tipo === 'vista' && !document.getElementById(VIEW_TABS[accion.valor])) return '';
    return `<button class="btn btn-secondary help-action" data-tipo="${esc(accion.tipo)}" data-valor="${esc(accion.valor)}">${esc(accion.etiqueta)}</button>`;
  }

  function runAction(tipo, valor) {
    if (tipo === 'vista' && typeof navigate === 'function') { toggle(false); navigate(valor); return; }
    if (valor === 'abrirPendientes' && typeof abrirPendientes === 'function') { toggle(false); abrirPendientes(); return; }
    if (valor === 'abrirTelegram' && typeof abrirTelegram === 'function') { toggle(false); abrirTelegram(); return; }
    if (valor === 'abrirDashboard') { window.open(window.HABITAT_BI_URL || 'http://localhost:3003', '_blank', 'noopener'); return; }
    if (valor === 'instalarApp') {
      const btn = document.getElementById('btnInstall');
      if (btn && !btn.classList.contains('hidden') && typeof instalarApp === 'function') { instalarApp(); return; }
      add('Ya está instalada o tu navegador no ofrece el botón. En iPhone: Compartir → "Agregar a pantalla de inicio". En Android: menú del navegador → "Instalar app".');
    }
  }

  function answerEntry(entry) {
    add(`<div>${esc(entry.respuesta)}</div>${actionButton(entry.accion) ? `<div class="help-actions">${actionButton(entry.accion)}</div>` : ''}`);
  }

  function offerAi(question) {
    if (navigator.onLine === false) {
      add('<span class="hint">Sin conexión solo puedo responder las preguntas frecuentes. Prueba con otras palabras.</span>');
      return;
    }
    const div = add(`<div class="help-actions"><button class="btn btn-secondary help-ai">${HabitatIcons.html('Sparkles', 14)}Preguntar al asistente IA</button></div>`);
    div.querySelector('.help-ai').onclick = async (e) => {
      e.currentTarget.disabled = true;
      const wait = add('<span class="hint">Pensando…</span>');
      try {
        const res = await fetch(`${API_URL}/ai/assistant`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }),
        });
        const data = await res.json();
        wait.remove();
        if (!data.success) throw new Error(data.message);
        add(`<div>${esc(data.data.answer)}</div><div class="hint help-source">Respuesta del asistente IA</div>`);
      } catch (err) {
        wait.remove();
        add(`<span class="hint">${esc(err.message || 'No se pudo consultar al asistente.')}</span>`);
      }
    };
  }

  async function ask(text) {
    const question = String(text || '').trim();
    if (question.length < 2) return;
    input.value = '';
    add(esc(question), 'user');
    await loadFaq();
    const vector = await vectorOf(question).catch(() => null);
    const ranked = M().rank(prepared.entries, question, vector, role());
    const best = ranked[0];
    // Sin modelo (todavía cargando o sin soporte) se decide solo por palabras clave.
    const direct = best && (vector ? best.score >= DIRECT : best.keyword >= 0.5);
    const suggest = best && (vector ? best.score >= SUGGEST : best.keyword > 0);
    if (direct) {
      answerEntry(best.entry);
      return;
    }
    if (suggest) {
      const opts = ranked.slice(0, 3).map((r) => `<button class="filter-chip help-suggest" data-id="${esc(r.entry.id)}">${esc(r.entry.pregunta)}</button>`).join('');
      const div = add(`<div>¿Te refieres a alguna de estas?</div><div class="help-actions">${opts}</div>`);
      div.querySelectorAll('.help-suggest').forEach((b) => {
        b.onclick = () => { add(esc(b.textContent), 'user'); answerEntry(prepared.entries.find((e) => e.id === b.dataset.id)); };
      });
    } else {
      add('No encontré eso en la ayuda.');
    }
    offerAi(question);
  }

  async function greet() {
    await loadFaq();
    const visibles = prepared.entries.filter((e) => e.roles.includes('TODOS') || e.roles.includes(role()));
    const firstName = window.currentUserReady && window.currentUserReady() ? String(currentUser.name || '').split(' ')[0] : '';
    const chips = visibles.slice(0, 4).map((e) => `<button class="filter-chip help-suggest" data-id="${esc(e.id)}">${esc(e.pregunta)}</button>`).join('');
    const div = add(`<div>Hola${firstName ? ` ${esc(firstName)}` : ''}. Pregúntame cómo hacer algo en Habitat Pro.</div><div class="help-actions">${chips}</div>`);
    div.querySelectorAll('.help-suggest').forEach((b) => {
      b.onclick = () => { add(esc(b.textContent), 'user'); answerEntry(prepared.entries.find((e) => e.id === b.dataset.id)); };
    });
  }

  function toggle(force) {
    build();
    const open = force !== undefined ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    if (open) {
      if (!list.childElementCount) greet();
      loadFaq().then(loadModel);
      setTimeout(() => input.focus(), 50);
    }
  }

  function setupVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = panel.querySelector('#helpMic');
    if (!SR) return;
    mic.classList.remove('hidden');
    mic.onclick = () => {
      const rec = new SR();
      rec.lang = 'es-BO';
      rec.interimResults = false;
      mic.classList.add('listening');
      rec.onresult = (e) => ask(e.results[0][0].transcript);
      rec.onend = () => mic.classList.remove('listening');
      rec.start();
    };
  }

  // Delegación: botones de acción dentro del chat.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.help-action');
    if (b) runAction(b.dataset.tipo, b.dataset.valor);
  });

  window.HabitatAssistant = {
    mostrar() { build(); fab.classList.remove('hidden'); },
    ocultar() { if (fab) fab.classList.add('hidden'); toggle(false); },
    abrir: () => toggle(true),
    estado: () => modelState, // idle | loading | ready | error
  };
})();
