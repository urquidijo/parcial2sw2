/**
 * PWA OFFLINE-FIRST & IDEMPOTENT SYNC MANAGER
 * 
 * Funcionalidad:
 * 1. Detección de conectividad online/offline
 * 2. Cola de transacciones locales en IndexedDB ('offline_mutations')
 * 3. Inyección automática de 'Idempotency-Key' UUIDv4 para deduplicación
 * 4. Algoritmo de reintentos con Exponential Backoff y Jitter
 */

const DB_NAME = 'PropTech_OfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_mutations';

// Generador de Claves de Idempotencia UUIDv4
export function generateIdempotencyKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Inicialización de base de datos IndexedDB en el cliente
export function openOfflineDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'idempotencyKey' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Encolar mutación offline con clave de idempotencia
export async function enqueueOfflineMutation({ endpoint, method, body, metadata = {} }) {
  const db = await openOfflineDatabase();
  const idempotencyKey = generateIdempotencyKey();

  const mutation = {
    idempotencyKey,
    endpoint,
    method,
    body,
    metadata,
    status: 'QUEUED',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(mutation);

    req.onsuccess = () => {
      console.log(`[PWA OFFLINE] Acción guardada localmente con Idempotency-Key: ${idempotencyKey}`);
      resolve(mutation);
    };
    req.onerror = () => reject(req.error);
  });
}

// Vaciar la cola de mutaciones con reintentos y backoff exponencial
export async function flushOfflineQueue() {
  if (!navigator.onLine) {
    console.warn('[PWA SYNC] No hay conexión a internet. La cola permanecerá en IndexedDB.');
    return;
  }

  const db = await openOfflineDatabase();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const getAllReq = store.getAll();

  getAllReq.onsuccess = async () => {
    const mutations = getAllReq.result.filter((m) => m.status === 'QUEUED' || m.status === 'RETRYING');
    console.log(`[PWA SYNC] Procesando ${mutations.length} operaciones pendientes...`);

    for (const item of mutations) {
      await processMutationWithBackoff(item, db);
    }
  };
}

async function processMutationWithBackoff(item, db, maxRetries = 4) {
  const baseDelay = 1000; // 1 segundo base
  const maxDelay = 16000; // 16 segundos máximo

  try {
    console.log(`[PWA SYNC] Enviando mutación: ${item.method} ${item.endpoint} (Idempotency-Key: ${item.idempotencyKey})`);

    const response = await fetch(item.endpoint, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': item.idempotencyKey,
      },
      body: item.body ? JSON.stringify(item.body) : undefined,
    });

    if (response.ok || response.status === 409) {
      // 200/201: Procesado; 409: Ya procesado por el backend (Idempotencia verificada)
      console.log(`✅ [PWA SYNC ÉXITO] Operación ${item.idempotencyKey} completada y confirmada.`);
      await removeMutation(item.idempotencyKey, db);
    } else {
      throw new Error(`HTTP Error ${response.status}`);
    }
  } catch (error) {
    item.retryCount = (item.retryCount || 0) + 1;
    if (item.retryCount >= maxRetries) {
      console.error(`❌ [PWA SYNC ABANDONO] Máximo de reintentos alcanzado para ${item.idempotencyKey}`);
      item.status = 'FAILED';
      await updateMutation(item, db);
      return;
    }

    // Fórmula: delay = min(maxDelay, baseDelay * 2^retryCount) + jitter
    const jitter = Math.random() * 1000;
    const delay = Math.min(maxDelay, baseDelay * Math.pow(2, item.retryCount)) + jitter;
    console.warn(`⚠️ [PWA SYNC REINTENTO] Fallo en ${item.idempotencyKey}. Reintentando en ${Math.round(delay)}ms... (Intento ${item.retryCount}/${maxRetries})`);

    item.status = 'RETRYING';
    await updateMutation(item, db);

    setTimeout(() => processMutationWithBackoff(item, db, maxRetries), delay);
  }
}

function removeMutation(idempotencyKey, db) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(idempotencyKey);
    tx.oncomplete = resolve;
  });
}

function updateMutation(item, db) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = resolve;
  });
}

// Escuchar automáticamente eventos de conexión del navegador
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 [PWA RED] Conexión a internet restablecida. Iniciando sincronización...');
    flushOfflineQueue();
  });
  window.addEventListener('offline', () => {
    console.warn('📡 [PWA RED] Conexión perdida. Pasando a modo Offline-First con IndexedDB.');
  });
}
