/**
 * Módulo de Notificaciones Push FCM v1 para Habitat Pro
 * Utiliza OAuth2 JWT nativo con la cuenta de servicio de Firebase (sin librerías pesadas)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FcmService {
  constructor() {
    this.serviceAccount = null;
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
    this.userFcmTokens = new Map(); // identifier (lowercase) -> Set(tokens)
    this.lastError = null;
    this._loadServiceAccount();
  }

  _loadServiceAccount() {
    try {
      const candidates = [
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        path.join(__dirname, '../firebase-service-account.json'),
        path.join(process.cwd(), 'firebase-service-account.json')
      ].filter(Boolean);

      for (const p of candidates) {
        if (fs.existsSync(p)) {
          this.serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
          console.log(`🔥 [FCM v1] Cuenta de servicio cargada: ${this.serviceAccount.project_id}`);
          break;
        }
      }

      if (!this.serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        this.serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        console.log(`🔥 [FCM v1] Cuenta de servicio cargada desde env: ${this.serviceAccount.project_id}`);
      }

      if (!this.serviceAccount) {
        console.warn(`⚠️ [FCM v1] ATENCIÓN: firebase-service-account.json no encontrado ni variable FIREBASE_SERVICE_ACCOUNT_JSON.`);
      }
    } catch (e) {
      this.lastError = `Error cargando cuenta de servicio: ${e.message}`;
      console.warn(`⚠️ [FCM v1] No se pudo cargar cuenta de servicio: ${e.message}`);
    }
  }

  getStatus() {
    return {
      serviceAccountLoaded: Boolean(this.serviceAccount),
      projectId: this.serviceAccount?.project_id || null,
      clientEmail: this.serviceAccount?.client_email || null,
      registeredUsersCount: this.userFcmTokens.size,
      registeredUsers: Array.from(this.userFcmTokens.keys()),
      lastError: this.lastError
    };
  }

  // Registrar el token FCM de un usuario cuando inicia sesión o abre la App Mobile
  registerToken(identifiers, token) {
    if (!token) return;
    const ids = Array.isArray(identifiers) ? identifiers : [identifiers];
    const registered = [];
    for (const raw of ids) {
      if (!raw) continue;
      const key = String(raw).trim().toLowerCase();
      if (!this.userFcmTokens.has(key)) {
        this.userFcmTokens.set(key, new Set());
      }
      this.userFcmTokens.get(key).add(token);
      registered.push(key);
    }

    // Registrar también bajo un identificador comodín por si es el único celular en pruebas
    if (!this.userFcmTokens.has('latest_device')) {
      this.userFcmTokens.set('latest_device', new Set());
    }
    this.userFcmTokens.get('latest_device').clear();
    this.userFcmTokens.get('latest_device').add(token);

    console.log(`📱 [FCM] Token móvil registrado para [${registered.join(', ')}] (Total registrados: ${this.userFcmTokens.size})`);
  }

  // Obtener Token de Acceso OAuth2 para la API de FCM v1
  async _getAccessToken() {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
    }

    if (!this.serviceAccount) {
      this.lastError = 'Falta el archivo firebase-service-account.json o la variable FIREBASE_SERVICE_ACCOUNT_JSON';
      throw new Error(this.lastError);
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: this.serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signatureInput = `${b64(header)}.${b64(claim)}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(this.serviceAccount.private_key, 'base64url');
    const jwt = `${signatureInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      this.lastError = `Error OAuth2 Google: ${data.error_description || res.status}`;
      throw new Error(this.lastError);
    }

    this.cachedAccessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return this.cachedAccessToken;
  }

  // Enviar mensaje push a un Token FCM específico
  async sendToToken(token, { title, body, data = {} }) {
    if (!this.serviceAccount) {
      this.lastError = 'firebase-service-account.json no está cargado en el servidor';
      return false;
    }
    try {
      const accessToken = await this._getAccessToken();
      const projectId = this.serviceAccount.project_id;
      const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

      const payload = {
        message: {
          token,
          notification: { title, body },
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channel_id: 'habitat_pro_channel',
              default_vibrate_timings: true
            }
          }
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.lastError = resData.error?.message || `HTTP ${res.status}`;
        console.warn(`⚠️ [FCM v1] Error enviando a token: ${this.lastError}`);
        return false;
      }
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = e.message;
      console.warn(`⚠️ [FCM v1] Falló envío push: ${e.message}`);
      return false;
    }
  }

  // Enviar push a todos los dispositivos móviles registrados del usuario
  async sendToUser(userOrKeys, { title, body, data = {} }) {
    const keys = (Array.isArray(userOrKeys) ? userOrKeys : [userOrKeys])
      .filter(Boolean)
      .map(k => String(k).trim().toLowerCase());

    if (keys.length === 0) {
      return { sent: 0, reason: 'NO_USER', lastError: 'No se indicaron identificadores de usuario' };
    }

    let tokens = new Set();
    for (const key of keys) {
      const found = this.userFcmTokens.get(key);
      if (found) {
        found.forEach(t => tokens.add(t));
      }
    }

    // Coincidencia parcial
    if (tokens.size === 0) {
      for (const key of keys) {
        for (const [registeredKey, set] of this.userFcmTokens.entries()) {
          if (registeredKey.includes(key) || key.includes(registeredKey)) {
            set.forEach(t => tokens.add(t));
          }
        }
      }
    }

    // Fallback: si no hay match directo pero hay un dispositivo móvil activo
    if (tokens.size === 0 && this.userFcmTokens.size > 0) {
      console.log(`ℹ️ [FCM v1] Sin match exacto para [${keys.join(', ')}]. Enviando al dispositivo activo en el sistema.`);
      for (const set of this.userFcmTokens.values()) {
        set.forEach(t => tokens.add(t));
      }
    }

    if (tokens.size === 0) {
      return { sent: 0, reason: 'NO_TOKENS', triedKeys: keys };
    }

    let sent = 0;
    for (const token of tokens) {
      const ok = await this.sendToToken(token, { title, body, data });
      if (ok) sent++;
    }
    console.log(`🔔 [FCM v1] Push enviado para [${keys.join(', ')}]: ${sent}/${tokens.size} dispositivos.`);
    return { sent, total: tokens.size, lastError: this.lastError };
  }
}

const fcmService = new FcmService();
module.exports = { fcmService };
