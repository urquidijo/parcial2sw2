package com.proptech.contracts.contract.domain;

/**
 * HEXAGONAL — Regla de negocio violada (dominio). Extiende IllegalStateException para que el adaptador
 * web la responda como hasta ahora: 409, o 422 en el pre-contrato de la saga (dispara la compensación).
 */
public class ContractRuleViolation extends IllegalStateException {
    public ContractRuleViolation(String message) {
        super(message);
    }
}
