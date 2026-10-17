package com.proptech.contracts.repository;

import com.proptech.contracts.model.Contract;
import com.proptech.contracts.model.ContractStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContractRepository extends JpaRepository<Contract, Long> {
    Optional<Contract> findByContractNumber(String contractNumber);
    Optional<Contract> findByPropertyIdAndStatusNot(String propertyId, ContractStatus status);
    List<Contract> findByClientId(String clientId);
    List<Contract> findByStatus(ContractStatus status);
}
