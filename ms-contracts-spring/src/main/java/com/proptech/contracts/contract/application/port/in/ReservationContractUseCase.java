package com.proptech.contracts.contract.application.port.in;

import com.proptech.contracts.model.Contract;

/** HEXAGONAL — Puerto de entrada usado por la saga de reserva: pre-contrato de arras (CU14) y su anulación (CU15). */
public interface ReservationContractUseCase {
    Contract generatePreContract(PreContractCommand command, Caller caller);
    Contract cancelForReservation(String paymentReferenceId, String reason, Caller caller);
}
