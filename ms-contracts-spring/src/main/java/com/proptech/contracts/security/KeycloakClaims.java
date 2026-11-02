package com.proptech.contracts.security;

import com.proptech.contracts.model.User;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Collection;
import java.util.List;
import java.util.Map;

public final class KeycloakClaims {

    private KeycloakClaims() {}

    public static List<String> realmRoles(Jwt jwt) {
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess != null && realmAccess.get("roles") instanceof Collection<?> roles) {
            return roles.stream().map(String::valueOf).toList();
        }
        return List.of();
    }

    public static String primaryRole(Jwt jwt) {
        List<String> roles = realmRoles(jwt);
        if (roles.contains(User.ROLE_ADMIN)) return User.ROLE_ADMIN;
        if (roles.contains(User.ROLE_EMPLEADO)) return User.ROLE_EMPLEADO;
        return User.ROLE_CLIENTE;
    }

    // ADMIN, CLIENTE o el sector del empleado (AGENTE, LEGAL, FINANZAS, ATENCION).
    public static String effectiveRole(Jwt jwt) {
        String role = primaryRole(jwt);
        if (User.ROLE_EMPLEADO.equals(role)) {
            String sector = jwt.getClaimAsString("sector");
            return sector != null ? sector : User.ROLE_EMPLEADO;
        }
        return role;
    }
}
