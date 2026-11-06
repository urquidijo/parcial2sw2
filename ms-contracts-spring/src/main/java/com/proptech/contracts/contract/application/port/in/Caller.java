package com.proptech.contracts.contract.application.port.in;

/**
 * HEXAGONAL — Quién ejecuta el caso de uso (lo arma el adaptador web a partir del token de Keycloak).
 * Los casos de uso no conocen JWT ni Spring Security.
 */
public record Caller(String id, String name, String role) {
    public boolean isClient() {
        return "CLIENTE".equals(role);
    }
}
