package com.proptech.contracts.contract.application.port.in;

import com.proptech.contracts.model.ContractType;

import java.math.BigDecimal;

/** HEXAGONAL — Datos de entrada del caso de uso "generar contrato" (CU11), sin anotaciones web. */
public record CreateContractCommand(String propertyId, String propertyTitle, String clientId, String clientName,
                                    String agentId, ContractType contractType, BigDecimal totalAmount,
                                    BigDecimal downPayment, String legalClauses) {}
