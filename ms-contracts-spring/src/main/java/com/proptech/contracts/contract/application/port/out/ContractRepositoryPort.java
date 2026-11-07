package com.proptech.contracts.contract.application.port.out;

import com.proptech.contracts.model.Contract;
import com.proptech.contracts.model.ContractType;

import java.util.List;
import java.util.Optional;

/**
 * HEXAGONAL — Puerto de salida (driven): define lo que la capa de aplicación necesita de la persistencia
 * de contratos, sin depender de Spring Data JPA ni de PostgreSQL.
 */
public interface ContractRepositoryPort {

    List<Contract> findByClientNewestFirst(String clientId);

    List<Contract> findAllNewestFirst();

    Optional<Contract> findById(Long id);

    Contract save(Contract contract);

    long count();

    boolean propertyHasActiveContract(String propertyId);

    boolean propertyHasActiveDefinitiveContract(String propertyId);

    Optional<String> agentOfActiveReservation(String propertyId);

    List<Contract> findActiveReservationContracts(String propertyId);

    Optional<Contract> findByPaymentReference(String paymentReferenceId, ContractType type);
}

