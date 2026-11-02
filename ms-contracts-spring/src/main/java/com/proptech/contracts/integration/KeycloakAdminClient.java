package com.proptech.contracts.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Cliente de la API de administración de Keycloak (cuenta de servicio habitat-admin-api).
@Component
public class KeycloakAdminClient {

    private final RestClient http = RestClient.create();
    private final String baseUrl;
    private final String realm;
    private final String clientId;
    private final String clientSecret;

    public KeycloakAdminClient(
            @Value("${keycloak.admin.base-url}") String baseUrl,
            @Value("${keycloak.admin.realm}") String realm,
            @Value("${keycloak.admin.client-id}") String clientId,
            @Value("${keycloak.admin.client-secret}") String clientSecret) {
        this.baseUrl = baseUrl;
        this.realm = realm;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    public String createEmployee(String email, String firstName, String lastName, String sector, String temporaryPassword) {
        Map<String, Object> user = Map.of(
                "username", email,
                "email", email,
                "firstName", firstName,
                "lastName", lastName,
                "enabled", true,
                "emailVerified", true,
                "attributes", Map.of("sector", List.of(sector)),
                "credentials", List.of(Map.of("type", "password", "value", temporaryPassword, "temporary", true)));
        String token = accessToken();
        ResponseEntity<Void> response;
        try {
            response = http.post().uri(adminUrl("/users"))
                    .headers(h -> h.setBearerAuth(token))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(user)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException.Conflict e) {
            throw new IllegalStateException("Ya existe una cuenta en Keycloak con el email " + email);
        }
        URI location = response.getHeaders().getLocation();
        if (location == null) {
            throw new IllegalStateException("Keycloak no devolvió el id del usuario creado");
        }
        String path = location.getPath();
        String keycloakId = path.substring(path.lastIndexOf('/') + 1);
        assignRealmRole(token, keycloakId, "EMPLEADO");
        return keycloakId;
    }

    public void updateSector(String keycloakId, String sector) {
        String token = accessToken();
        Map<String, Object> user = getUser(token, keycloakId);
        @SuppressWarnings("unchecked")
        Map<String, Object> attributes = new HashMap<>((Map<String, Object>) user.getOrDefault("attributes", Map.of()));
        attributes.put("sector", List.of(sector));
        user.put("attributes", attributes);
        putUser(token, keycloakId, user);
    }

    public void setEnabled(String keycloakId, boolean enabled) {
        String token = accessToken();
        Map<String, Object> user = getUser(token, keycloakId);
        user.put("enabled", enabled);
        putUser(token, keycloakId, user);
        if (!enabled) {
            http.post().uri(adminUrl("/users/" + keycloakId + "/logout"))
                    .headers(h -> h.setBearerAuth(token))
                    .retrieve().toBodilessEntity();
        }
    }

    public String findUserIdByEmail(String email) {
        String token = accessToken();
        List<?> users = http.get().uri(adminUrl("/users") + "?exact=true&email={email}", email)
                .headers(h -> h.setBearerAuth(token))
                .retrieve().body(List.class);
        if (users == null || users.isEmpty()) {
            throw new IllegalArgumentException("No existe una cuenta en Keycloak con el email " + email);
        }
        return String.valueOf(((Map<?, ?>) users.get(0)).get("id"));
    }

    private void assignRealmRole(String token, String keycloakId, String roleName) {
        Map<?, ?> role = http.get().uri(adminUrl("/roles/" + roleName))
                .headers(h -> h.setBearerAuth(token))
                .retrieve().body(Map.class);
        http.post().uri(adminUrl("/users/" + keycloakId + "/role-mappings/realm"))
                .headers(h -> h.setBearerAuth(token))
                .contentType(MediaType.APPLICATION_JSON)
                .body(List.of(role))
                .retrieve().toBodilessEntity();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getUser(String token, String keycloakId) {
        Map<String, Object> user = http.get().uri(adminUrl("/users/" + keycloakId))
                .headers(h -> h.setBearerAuth(token))
                .retrieve().body(Map.class);
        return new HashMap<>(user);
    }

    private void putUser(String token, String keycloakId, Map<String, Object> user) {
        http.put().uri(adminUrl("/users/" + keycloakId))
                .headers(h -> h.setBearerAuth(token))
                .contentType(MediaType.APPLICATION_JSON)
                .body(user)
                .retrieve().toBodilessEntity();
    }

    private String accessToken() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        Map<?, ?> response = http.post().uri(baseUrl + "/realms/" + realm + "/protocol/openid-connect/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve().body(Map.class);
        return String.valueOf(response.get("access_token"));
    }

    private String adminUrl(String path) {
        return baseUrl + "/admin/realms/" + realm + path;
    }
}
