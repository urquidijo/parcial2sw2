/**
 * CU22 — Cola de acciones sin conexión (IndexedDB) para la PWA de Habitat Pro.
 *
 * Qué se encola: solo lo que no mueve dinero ni compite por un inmueble —
 *   agendar visita (CU09) y enviar consulta al asesor (CU01).
 * Reservar (pago de arras), cancelar, cobrar o firmar NO se encolan: necesitan conexión.
 *
 * Cada acción guarda su Idempotency-Key: si al reconectar se envía dos veces (dos pestañas,
 * corte a mitad del envío), el gateway la ejecuta una sola vez.
 * El token NO se guarda: al enviar se usa la sesión vigente (si venció, se pide iniciar sesión).
 * Reemplaza al borrador src/pwa/offline-sync-manager.js (módulo ES que nunca se cargó).
 */
(function () {
  const DB_NAME = 'habitat-offline';
  const STORE = 'cola';
  const QUEUEABLE = [
    { re: /\/api\/appointments$/, label: 'Visita agendada' },
    { re: /\/api\/properties\/[^/]+\/inquiries$/, label: 'Consulta al asesor' },
  ];
  const MAX_ATTEMPTS = 8;

  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  const listeners = new Set();
  async function notify() {
    const items = await list().catch(() => []);
    listeners.forEach((fn) => { try { fn(items); } catch (_) { /* nada */ } });
  }

  function queueable(method, url) {
    if (method !== 'POST') return null;
    const path = url.split('?')[0];
    return QUEUEABLE.find((q) => q.re.test(path)) || null;
  }

  async function enqueue({ url, method, body, key, label, summary }) {
    await tx('readwrite', (s) => s.put({
      key, url, method, body: typeof body === 'string' ? body : JSON.stringify(body ?? null),
      label, summary: summary || '', createdAt: new Date().toISOString(), attempts: 0, lastError: '',
    }));
    notify();
  }

  function list() {
    return tx('readonly', (s) => s.getAll()).then((items) => (items || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async function remove(key) {
    await tx('readwrite', (s) => s.delete(key));
    notify();
  }

  async function update(item) {
    await tx('readwrite', (s) => s.put(item));
  }

  /**
   * Envía la cola en orden. `send(item)` hace el POST real (con token e Idempotency-Key) y devuelve la Response.
   * Resultado: { sent: [...], failed: [...], needsLogin: bool }.
   */
  let flushing = null;
  function flush(send) {
    if (flushing) return flushing;
    flushing = (async () => {
      const out = { sent: [], failed: [], needsLogin: false };
      for (const item of await list()) {
        let res;
        try {
          res = await send(item);
        } catch (err) {
          item.attempts += 1;
          item.lastError = 'Sin conexión';
          await update(item);
          break; // sigue sin red: se reintenta después
        }
        if (res.status === 401) { out.needsLogin = true; break; }
        const data = await res.json().catch(() => ({}));
        if (res.ok || data.success) {
          out.sent.push(item);
          await remove(item.key);
        } else if (res.status >= 500 || res.status === 409 || res.status === 429) {
          item.attempts += 1;
          item.lastError = data.message || `Error ${res.status}`;
          if (item.attempts >= MAX_ATTEMPTS) { out.failed.push({ ...item }); }
          await update(item);
        } else {
          // Rechazo definitivo (datos inválidos, horario ocupado…): se quita y se avisa el motivo.
          out.failed.push({ ...item, lastError: data.message || `Error ${res.status}` });
          await remove(item.key);
        }
      }
      notify();
      return out;
    })().finally(() => { flushing = null; });
    return flushing;
  }

  window.HabitatOffline = {
    queueable, enqueue, list, remove, flush,
    onChange(fn) { listeners.add(fn); notify(); return () => listeners.delete(fn); },
  };
})();
