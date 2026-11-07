class AppConfig {
  // Endpoints desplegados en producción (Railway + AWS S3 + Azure PostgreSQL + MongoDB Atlas + DynamoDB)
  static const String apiGatewayUrl =
      'https://api-gateway-production-c3ed.up.railway.app/api';

  static const String keycloakBaseUrl =
      'https://keycloak-production-f968.up.railway.app';

  static const String keycloakRealm = 'habitat';
  static const String keycloakClientId = 'habitat-web';

  static String get keycloakTokenEndpoint =>
      '$keycloakBaseUrl/realms/$keycloakRealm/protocol/openid-connect/token';

  static String get keycloakRegistrationUrl =>
      '$keycloakBaseUrl/realms/$keycloakRealm/protocol/openid-connect/registrations'
      '?client_id=$keycloakClientId&response_type=code&scope=openid%20profile%20email'
      '&redirect_uri=${Uri.encodeComponent("https://parcial2sw2-mfe-shell.vercel.app/")}';
}

