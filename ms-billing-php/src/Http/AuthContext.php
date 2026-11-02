<?php

namespace PropTech\Billing\Http;

// Claims del token de Keycloak de la petición actual.
// Rol efectivo igual que en el gateway, ms-contracts y ms-properties: ADMIN, el sector del EMPLEADO o CLIENTE.
final class AuthContext {
    private static array $claims = [];

    public static function set(array $claims): void {
        self::$claims = $claims;
    }

    public static function role(): string {
        $roles = self::$claims['realm_access']['roles'] ?? [];
        if (in_array('ADMIN', $roles, true)) return 'ADMIN';
        if (in_array('EMPLEADO', $roles, true)) return strtoupper((string) (self::$claims['sector'] ?? 'EMPLEADO'));
        return 'CLIENTE';
    }

    public static function email(): string {
        return strtolower(trim((string) (self::$claims['email'] ?? '')));
    }

    public static function name(): string {
        return (string) (self::$claims['name'] ?? self::$claims['preferred_username'] ?? self::email());
    }

    /** @param string[] $roles */
    public static function requireRole(array $roles): void {
        if (!in_array(self::role(), $roles, true)) {
            throw ApiException::forbidden('Tu rol (' . self::role() . ') no puede realizar esta operación');
        }
    }
}
