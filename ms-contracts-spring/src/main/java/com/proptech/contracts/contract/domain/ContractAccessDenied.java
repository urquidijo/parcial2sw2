package com.proptech.contracts.contract.domain;

/**
 * HEXAGONAL — El usuario no es titular del contrato. Es del dominio (no de Spring Security);
 * el adaptador web la traduce a 403.
 */
public class ContractAccessDenied extends RuntimeException {
    public ContractAccessDenied(String message) {
        super(message);
    }
}
