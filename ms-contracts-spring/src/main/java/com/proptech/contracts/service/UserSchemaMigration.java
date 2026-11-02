package com.proptech.contracts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// Migración idempotente del modelo anterior (contraseñas en texto plano, roles AGENTE/LEGAL) a Keycloak + sector.
@Component
public class UserSchemaMigration implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UserSchemaMigration.class);

    private final JdbcTemplate jdbc;
    private final UserService userService;

    public UserSchemaMigration(JdbcTemplate jdbc, UserService userService) {
        this.jdbc = jdbc;
        this.userService = userService;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash");
        int migrated = jdbc.update(
                "UPDATE users SET sector = role, role = 'EMPLEADO' WHERE role IN ('AGENTE', 'LEGAL', 'FINANZAS', 'ATENCION')");
        if (migrated > 0) {
            log.info("Migrados {} usuarios al rol EMPLEADO con sector.", migrated);
        }
        userService.seedInitialUsers();
    }
}
