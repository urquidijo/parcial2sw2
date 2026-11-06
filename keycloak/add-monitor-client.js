/**
 * Crea (o actualiza) en un Keycloak que ya está corriendo la cuenta de servicio del agente monitor (CU21).
 * El realm solo se importa la primera vez que arranca Keycloak, así que quien ya tenía Keycloak corre esto una vez:
 *
 *   node keycloak/add-monitor-client.js
 *
 * Lee del .env de la raíz: KEYCLOAK_MONITOR_CLIENT_SECRET (obligatorio), y opcionales KEYCLOAK_URL,
 * KEYCLOAK_CONSOLE_USER / KEYCLOAK_CONSOLE_PASSWORD (por defecto los del docker-compose).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const BASE = (process.env.KEYCLOAK_URL || 'http://localhost:8080').replace(/\/$/, '');
const REALM = 'habitat';
const CLIENT_ID = 'habitat-monitor';
const SECRET = process.env.KEYCLOAK_MONITOR_CLIENT_SECRET;

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}/admin/realms/${REALM}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

(async () => {
  if (!SECRET) throw new Error('Falta KEYCLOAK_MONITOR_CLIENT_SECRET en el .env de la raíz');
  const login = await fetch(`${BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password', client_id: 'admin-cli',
      username: process.env.KEYCLOAK_CONSOLE_USER || 'admin',
      password: process.env.KEYCLOAK_CONSOLE_PASSWORD || 'admin_keycloak_password',
    }),
  }).then((r) => r.json());
  if (!login.access_token) throw new Error('No se pudo entrar a la consola de Keycloak: ' + JSON.stringify(login));
  const token = login.access_token;

  const client = {
    clientId: CLIENT_ID, name: 'Agente monitor del negocio (CU21)', enabled: true, publicClient: false,
    clientAuthenticatorType: 'client-secret', secret: SECRET, serviceAccountsEnabled: true,
    standardFlowEnabled: false, directAccessGrantsEnabled: false,
  };
  let [existing] = await api(token, 'GET', `/clients?clientId=${CLIENT_ID}`);
  if (existing) {
    await api(token, 'PUT', `/clients/${existing.id}`, { ...existing, ...client });
    console.log('Cliente actualizado:', CLIENT_ID);
  } else {
    await api(token, 'POST', '/clients', client);
    [existing] = await api(token, 'GET', `/clients?clientId=${CLIENT_ID}`);
    console.log('Cliente creado:', CLIENT_ID);
  }

  // Usuario de la cuenta de servicio: email (ms-contracts lo exige para su perfil) y rol ADMIN.
  const user = await api(token, 'GET', `/clients/${existing.id}/service-account-user`);
  await api(token, 'PUT', `/users/${user.id}`, { ...user, email: 'monitor@habitat.pro', emailVerified: true, firstName: 'Agente', lastName: 'Monitor' });
  const admin = await api(token, 'GET', '/roles/ADMIN');
  await api(token, 'POST', `/users/${user.id}/role-mappings/realm`, [admin]);
  console.log('Cuenta de servicio lista: monitor@habitat.pro con rol ADMIN');
})().catch((err) => { console.error(err.message); process.exit(1); });
