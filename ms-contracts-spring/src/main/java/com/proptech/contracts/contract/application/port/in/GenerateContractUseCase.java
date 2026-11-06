package com.proptech.contracts.contract.application.port.in;

import com.proptech.contracts.model.Contract;

/** HEXAGONAL — Puerto de entrada: el Oficial Legal genera un contrato de compraventa o alquiler (CU11). */
public interface GenerateContractUseCase {
    Contract create(CreateContractCommand command);
}
