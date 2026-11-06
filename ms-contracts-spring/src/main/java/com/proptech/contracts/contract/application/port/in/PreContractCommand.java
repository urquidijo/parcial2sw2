package com.proptech.contracts.contract.application.port.in;

import java.math.BigDecimal;

/** HEXAGONAL — Datos de entrada del pre-contrato de arras (paso 3 de la saga de reserva). */
public record PreContractCommand(String propertyId, String propertyTitle, String clientId, String clientName,
                                 String agentId, String paymentReferenceId, BigDecimal totalAmount,
                                 BigDecimal depositAmount) {}
