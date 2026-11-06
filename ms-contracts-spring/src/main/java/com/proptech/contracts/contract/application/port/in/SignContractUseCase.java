package com.proptech.contracts.contract.application.port.in;

import com.proptech.contracts.model.Contract;

/** HEXAGONAL — Puerto de entrada: firma digital del cliente titular o del Oficial Legal (CU12). */
public interface SignContractUseCase {
    Contract sign(Long id, Caller caller);
}
