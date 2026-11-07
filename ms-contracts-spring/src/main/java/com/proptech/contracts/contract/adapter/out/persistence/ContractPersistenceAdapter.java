package com.proptech.contracts.contract.adapter.out.persistence;

import com.proptech.contracts.contract.application.port.out.ContractRepositoryPort;
import com.proptech.contracts.contract.domain.ContractRules;
import com.proptech.contracts.model.Contract;
import com.proptech.contracts.model.ContractType;
import com.proptech.contracts.repository.ContractRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * HEXAGONAL — Adaptador de salida (driven): implementa ContractRepositoryPort delegando en Spring Data JPA
 * (ContractRepository) hacia PostgreSQL.
 */
@Component
public class ContractPersistenceAdapter implements ContractRepositoryPort {

    private final ContractRepository repository;

    public ContractPersistenceAdapter(ContractRepository repository) {
        this.repository = repository;
    }

    @Override
    public List<Contract> findByClientNewestFirst(String clientId) {
        return repository.findByClientIdOrderByCreatedAtDesc(clientId);
    }

    @Override
    public List<Contract> findAllNewestFirst() {
        return repository.findAllByOrderByCreatedAtDesc();
    }

    @Override
    public Optional<Contract> findById(Long id) {
        return repository.findById(id);
    }

    @Override
    public Contract save(Contract contract) {
        return repository.save(contract);
    }

    @Override
    public long count() {
        return repository.count();
    }

    @Override
    public boolean propertyHasActiveContract(String propertyId) {
        return repository.existsByPropertyIdAndStatusNotIn(propertyId, ContractRules.CLOSED_STATUSES);
    }

    @Override
    public boolean propertyHasActiveDefinitiveContract(String propertyId) {
        return repository.existsByPropertyIdAndContractTypeNotAndStatusNotIn(
                propertyId, ContractType.RESERVA_CON_ARRAS, ContractRules.CLOSED_STATUSES);
    }

    @Override
    public Optional<String> agentOfActiveReservation(String propertyId) {
        return repository.findFirstByPropertyIdAndContractTypeAndStatusNotInOrderByCreatedAtDesc(
                        propertyId, ContractType.RESERVA_CON_ARRAS, ContractRules.CLOSED_STATUSES)
                .map(Contract::getAgentId);
    }

    @Override
    public List<Contract> findActiveReservationContracts(String propertyId) {
        return repository.findByPropertyIdAndContractTypeAndStatusNotIn(
                propertyId, ContractType.RESERVA_CON_ARRAS, ContractRules.CLOSED_STATUSES);
    }

    @Override
    public Optional<Contract> findByPaymentReference(String paymentReferenceId, ContractType type) {
        return repository.findFirstByPaymentReferenceIdAndContractType(paymentReferenceId, type);
    }
}

