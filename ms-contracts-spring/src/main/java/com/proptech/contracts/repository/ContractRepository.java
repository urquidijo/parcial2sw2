package com.proptech.contracts.repository;

import com.proptech.contracts.model.Contract;
import com.proptech.contracts.model.ContractStatus;
import com.proptech.contracts.model.ContractType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ContractRepository extends JpaRepository<Contract, Long> {
    Optional<Contract> findByContractNumber(String contractNumber);
    boolean existsByPropertyIdAndStatusNotIn(String propertyId, Collection<ContractStatus> statuses);
    boolean existsByPropertyIdAndContractTypeNotAndStatusNotIn(String propertyId, ContractType type, Collection<ContractStatus> statuses);
    List<Contract> findByClientIdOrderByCreatedAtDesc(String clientId);
    List<Contract> findAllByOrderByCreatedAtDesc();
    List<Contract> findByStatus(ContractStatus status);
    Optional<Contract> findFirstByPaymentReferenceIdAndContractType(String paymentReferenceId, ContractType type);
    Optional<Contract> findFirstByPropertyIdAndContractTypeAndStatusNotInOrderByCreatedAtDesc(String propertyId, ContractType type, Collection<ContractStatus> statuses);
}
