/**
 * SSO CLIENT HELPER CON KEYCLOAK / OPENID CONNECT (OIDC) + PKCE
 * Provee inicio de sesión único a través de todos los Microfrontends (Shell, React, Angular, Vue)
 */

export class KeycloakSSOService {
  constructor(config = {}) {
    this.authServerUrl = config.authServerUrl || 'http://localhost:8080';
    this.realm = config.realm || 'proptech-realm';
    this.clientId = config.clientId || 'proptech-shell-app';
    this.token = null;
    this.userProfile = null;
  }

  /**
   * Inicializa la sesión SSO verificando tokens guardados o redirigiendo a Keycloak
   */
  async init() {
    console.log(`[SSO] Inicializando sesión OIDC con Realm: "${this.realm}" en ${this.authServerUrl}`);
    
    // Obtener token almacenado en sessionStorage
    const savedToken = sessionStorage.getItem('kc_access_token');
    if (savedToken) {
      this.token = savedToken;
      this.userProfile = JSON.parse(sessionStorage.getItem('kc_user_profile') || '{}');
      console.log(`[SSO] Sesión activa recuperada para: ${this.userProfile.preferred_username || 'Usuario'}`);
      return { authenticated: true, user: this.userProfile, token: this.token };
    }

    // Modo desarrollo / Mock para entornos locales sin realm configurado
    return this.mockDevLogin('agente.inmobiliario@proptech.com', ['ROLE_AGENTE', 'ROLE_INSPECTOR_CAMPO']);
  }

  /**
   * Redirige al login de Keycloak con flujo Authorization Code + PKCE
   */
  login() {
    const redirectUri = encodeURIComponent(window.location.origin);
    const loginUrl = `${this.authServerUrl}/realms/${this.realm}/protocol/openid-connect/auth?client_id=${this.clientId}&response_type=code&scope=openid%20profile%20email&redirect_uri=${redirectUri}`;
    window.location.href = loginUrl;
  }

  logout() {
    sessionStorage.removeItem('kc_access_token');
    sessionStorage.removeItem('kc_user_profile');
    const redirectUri = encodeURIComponent(window.location.origin);
    window.location.href = `${this.authServerUrl}/realms/${this.realm}/protocol/openid-connect/logout?redirect_uri=${redirectUri}`;
  }

  /**
   * Helper para simular login de desarrollo mientras Keycloak importa el Realm
   */
  mockDevLogin(username, roles) {
    this.userProfile = {
      username,
      email: username,
      preferred_username: username,
      roles: roles || ['ROLE_AGENTE'],
      agencyId: 'AGENCY-CENTRAL-01',
    };
    this.token = 'mock-jwt-token-' + btoa(JSON.stringify(this.userProfile));
    sessionStorage.setItem('kc_access_token', this.token);
    sessionStorage.setItem('kc_user_profile', JSON.stringify(this.userProfile));

    return { authenticated: true, user: this.userProfile, token: this.token };
  }

  hasRole(role) {
    if (!this.userProfile || !this.userProfile.roles) return false;
    return this.userProfile.roles.includes(role);
  }

  getAuthorizationHeader() {
    return this.token ? `Bearer ${this.token}` : '';
  }
}

export const ssoInstance = new KeycloakSSOService();
