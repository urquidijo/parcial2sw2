/**
 * Service Worker de Habitat Pro (PWA, Fase 3).
 *
 * Qué se guarda para usar sin conexión:
 *  - La app (shell, microfrontends y librerías de CDN con versión fija).
 *  - El modelo de IA que detecta objetos en las fotos (corre en el navegador, CU04).
 *  - El catálogo de inmuebles y la lista de ciudades/zonas: se pide a la red y, si no hay, se usa la última copia.
 *  - Las fotos de los inmuebles (máx. 200).
 * Qué NUNCA se guarda: escrituras (POST/PUT/PATCH/DELETE), sesión, IA, finanzas ni datos del personal.
 * Las escrituras sin conexión las encola la página (cola en IndexedDB con Idempotency-Key), no este archivo.
 */
const VERSION = 'v3';
const APP_CACHE = `habitat-app-${VERSION}`;
const DATA_CACHE = `habitat-data-${VERSION}`;
const IMG_CACHE = `habitat-img-${VERSION}`;
const CDN_CACHE = `habitat-cdn-${VERSION}`;
const MAX_IMAGES = 200;

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge-96.png',
];

// Datos de lectura que sirven sin conexión (GET al gateway).
const OFFLINE_API = [
  /\/api\/properties(\/[^/]+)?$/,   // catálogo y ficha
  /\/api\/ml\/locations$/,          // ciudades y zonas del formulario
];

// Librerías de CDN: las URLs llevan versión, así que nunca cambian.
const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Precarga tolerante: cada archivo por separado (cache.addAll falla entera si una sola entrada choca
// y deja el Service Worker sin instalar).
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(PRECACHE.map(async (url) => {
      const res = await fetch(url, { cache: 'reload' });
      if (res.ok) await safePut(cache, url, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, DATA_CACHE, IMG_CACHE, CDN_CACHE];
    for (const key of await caches.keys()) {
      if (key.startsWith('habitat-') && !keep.includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// CU06: aviso push (reserva confirmada, cancelada o por vencer). Llega aunque la app esté cerrada.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Habitat Pro';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  }));
});

// Al tocar el aviso: enfoca la app si ya está abierta, si no la abre en la sección indicada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      open.postMessage({ type: 'HABITAT_NAVIGATE', url: target });
      return;
    }
    await self.clients.openWindow(target);
  })());
});

// La página pide activar la versión nueva cuando el usuario pulsa "Actualizar".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                     // escrituras: siempre a la red
  const url = new URL(req.url);

  // Navegación: red primero; sin conexión, la app guardada.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, APP_CACHE, { fallbackUrl: '/' }));
    return;
  }

  // API del gateway: solo el catálogo se guarda; el resto pasa directo.
  if (url.pathname.includes('/api/')) {
    if (OFFLINE_API.some((re) => re.test(url.pathname))) {
      event.respondWith(networkFirst(req, DATA_CACHE, { markOffline: true }));
    }
    return;
  }

  // Microfrontends locales (/mfe/... llevan ?v= para no quedar viejos): red primero, guardados sin el ?v=.
  if (url.origin === self.location.origin && url.pathname.startsWith('/mfe/')) {
    event.respondWith(networkFirst(req, APP_CACHE, { ignoreSearch: true }));
    return;
  }

  if (req.destination === 'image') {
    event.respondWith(staleWhileRevalidate(req, IMG_CACHE, MAX_IMAGES));
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, CDN_CACHE));
    return;
  }

  // Pesos del modelo de IA del navegador (CU04, COCO-SSD): archivos estáticos que se sirven desde el
  // microfrontend de inmuebles (otro dominio que el shell) y no cambian. Se guardan al usarlos la primera
  // vez para que "Autocompletar desde fotos" funcione sin conexión.
  if (url.pathname.includes('/models/') && /\.(json|bin)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, CDN_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, APP_CACHE));
  }
});

const keyOf = (req, ignoreSearch) => {
  if (!ignoreSearch) return req;
  const url = new URL(req.url);
  url.search = '';
  return url.toString();
};

// Guardar en caché nunca debe romper la respuesta: dos escrituras simultáneas de la misma URL
// (p. ej. la precarga y la vuelta del login) hacen fallar cache.put con "Entry already exists".
async function safePut(cache, key, res) {
  try { await cache.put(key, res); } catch (_) { /* se guarda en la próxima visita */ }
}

async function networkFirst(req, cacheName, { fallbackUrl, ignoreSearch, markOffline } = {}) {
  const cache = await caches.open(cacheName);
  let res;
  try {
    res = await fetch(req);
  } catch (err) {
    const cached = (await cache.match(keyOf(req, ignoreSearch))) || (fallbackUrl && (await caches.match(fallbackUrl)));
    if (!cached) throw err;
    if (!markOffline) return cached;
    // Marca la respuesta como "copia sin conexión" para que la página muestre el aviso.
    const headers = new Headers(cached.headers);
    headers.set('X-Habitat-Offline', '1');
    return new Response(await cached.blob(), { status: cached.status, headers });
  }
  if (res.ok) {
    // Se guarda junto con la hora, para mostrar "catálogo guardado el ..." sin conexión.
    try {
      const headers = new Headers(res.headers);
      headers.set('X-Habitat-Saved-At', new Date().toISOString());
      const body = await res.clone().blob();
      await safePut(cache, keyOf(req, ignoreSearch), new Response(body, { status: res.status, statusText: res.statusText, headers }));
    } catch (_) { /* no se pudo guardar: la respuesta igual llega */ }
  }
  return res;
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') safePut(cache, req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const update = fetch(req).then(async (res) => {
    if (res.ok || res.type === 'opaque') {
      await safePut(cache, req, res.clone());
      if (maxEntries) trim(cache, maxEntries);
    }
    return res;
  }).catch(() => cached || Response.error());
  return cached || update;
}

async function trim(cache, maxEntries) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i += 1) await cache.delete(keys[i]);
}
