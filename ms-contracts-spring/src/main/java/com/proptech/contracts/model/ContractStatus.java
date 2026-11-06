package com.proptech.contracts.model;

public enum ContractStatus {
    BORRADOR,
    PENDIENTE_FIRMA,
    FIRMADO,
    CANCELADO,
    RECHAZADO,
    // Pre-contrato de arras cumplido: el contrato definitivo del inmueble quedó firmado.
    CONCLUIDO
}
