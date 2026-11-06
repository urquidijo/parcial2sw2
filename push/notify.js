/**
 * CU06 — Notificaciones Web Push (VAPID) desde el gateway.
 *
 * Los dispositivos de cada usuario están en ms-contracts (tabla push_subscriptions). El gateway las lee con
 * la cuenta de servicio (ADMIN), cifra el aviso con web-push y lo envía al servicio de push del navegador
 * (FCM en Android/Chrome, Mozilla, Apple). Si el servicio responde 404/410 el dispositivo ya no existe y se borra.
 * Un aviso que falla nunca rompe la operación que lo originó (reserva, cancelación).
 */
const webpush = require('web-push');

function createPush({ contractsSvc, serviceAuthorization, log = console }) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:soporte@habitat.pro';
  const enabled = Boolean(publicKey && privateKey);
  if (enabled) webpush.setVapidDetails(subject, publicKey, privateKey);
  else log.warn('[push] Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el .env: las notificaciones push están apagadas.');

  async function contracts(path, init = {}) {
    const authorization = await serviceAuthorization();
    const res = await fetch(`${contractsSvc}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: authorization } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `ms-contracts respondió ${res.status}`);
    return body;
  }

  /**
   * Envía { title, body, url, tag } a todos los dispositivos del usuario. Devuelve { devices, sent }.
   */
  async function sendToUser(userId, payload) {
    if (!enabled || !userId) return { devices: 0, sent: 0, skipped: !enabled ? 'SIN_VAPID' : 'SIN_USUARIO' };
    try {
      const subs = (await contracts(`/push/subscriptions?userId=${encodeURIComponent(userId)}`)).data || [];
      const message = JSON.stringify({ icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', url: '/', ...payload });
      let sent = 0;
      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 24 * 3600, urgency: 'high' });
          sent += 1;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await contracts(`/push/subscriptions?endpoint=${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => {});
          } else {
            log.warn(`[push] No se pudo enviar a un dispositivo (${err.statusCode || err.message}).`);
          }
        }
      }));
      return { devices: subs.length, sent };
    } catch (err) {
      log.warn(`[push] ${err.message}`);
      return { devices: 0, sent: 0, error: err.message };
    }
  }

  return { enabled, publicKey: publicKey || null, sendToUser };
}

module.exports = { createPush };
