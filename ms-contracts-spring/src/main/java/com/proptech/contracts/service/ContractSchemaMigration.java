package com.proptech.contracts.service;

import com.proptech.contracts.model.ContractStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Migración idempotente: Hibernate creó la restricción CHECK de contracts.status con los estados que existían
 * entonces, y ddl-auto=update no la actualiza. Si falta algún estado del enum (p. ej. CONCLUIDO), se vuelve a
 * crear con todos. Solo cambia la restricción; no modifica ninguna fila.
 */
@Component
public class ContractSchemaMigration implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ContractSchemaMigration.class);
    private static final String CONSTRAINT = "contracts_status_check";

    private final JdbcTemplate jdbc;

    public ContractSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<String> defs = jdbc.queryForList(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'contracts'::regclass AND conname = ?",
                String.class, CONSTRAINT);
        List<String> statuses = Arrays.stream(ContractStatus.values()).map(Enum::name).toList();
        if (!defs.isEmpty() && statuses.stream().allMatch(s -> defs.get(0).contains("'" + s + "'"))) {
            return; // ya admite todos los estados
        }
        String allowed = statuses.stream().map(s -> "'" + s + "'").collect(Collectors.joining(", "));
        jdbc.execute("ALTER TABLE contracts DROP CONSTRAINT IF EXISTS " + CONSTRAINT);
        jdbc.execute("ALTER TABLE contracts ADD CONSTRAINT " + CONSTRAINT + " CHECK (status IN (" + allowed + "))");
        log.info("Restricción {} actualizada: estados permitidos {}", CONSTRAINT, statuses);
    }
}
