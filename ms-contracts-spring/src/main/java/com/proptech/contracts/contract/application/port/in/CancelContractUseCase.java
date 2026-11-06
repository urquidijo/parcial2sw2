package com.proptech.contracts.contract.application.port.in;

import com.proptech.contracts.model.Contract;

/** HEXAGONAL — Puerto de entrada: anular un contrato (CU11). */
public interface CancelContractUseCase {
    Contract cancel(Long id, String reason);
}
