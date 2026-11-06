package com.proptech.contracts.contract.application;

import com.proptech.contracts.contract.application.port.in.*;
import com.proptech.contracts.contract.application.port.out.ContractRepositoryPort;
import com.proptech.contracts.contract.domain.ContractRules;
import com.proptech.contracts.model.Contract;
import com.proptech.contracts.model.ContractSignature;
import com.proptech.contracts.model.ContractStatus;
import com.proptech.contracts.model.ContractType;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

/**
 * HEXAGONAL — Capa de aplicación: implementa los puertos de entrada (casos de uso) orquestando las reglas
 * del dominio (ContractRules) y el puerto de salida (ContractRepositoryPort). No conoce HTTP, JWT ni JPA.
 */
@Service
public class ContractApplicationService implements QueryContractsUseCase, GenerateContractUseCase, SignContractUseCase,
        CancelContractUseCase, ReservationContractUseCase {

    private static final Logger log = LoggerFactory.getLogger(ContractApplicationService.class);

    private final ContractRepositoryPort contracts;

    public ContractApplicationService(ContractRepositoryPort contracts) {
        this.contracts = contracts;
    }

    // ---------------- consultas ----------------

    @Override
    @Transactional(readOnly = true)
    public List<Contract> list(Caller caller) {
        return caller.isClient() ? contracts.findByClientNewestFirst(caller.id()) : contracts.findAllNewestFirst();
    }

    @Override
    @Transactional(readOnly = true)
    public Contract getVisible(Long id, Caller caller) {
        Contract contract = getById(id);
        ContractRules.ensureOwner(caller.isClient(), contract.getClientId(), caller.id(), "Solo puedes ver tus propios contratos");
        return contract;
    }

    // ---------------- CU11: generar y anular ----------------

    @Override
    @Transactional
    public Contract create(CreateContractCommand cmd) {
        ContractRules.ensureNoActiveDefinitiveContract(contracts.propertyHasActiveDefinitiveContract(cmd.propertyId()), cmd.propertyId());
        Contract contract = new Contract();
        contract.setContractNumber(ContractRules.newContractNumber("CTR"));
        contract.setPropertyId(cmd.propertyId());
        contract.setPropertyTitle(cmd.propertyTitle());
        contract.setClientId(cmd.clientId());
        contract.setUserName(cmd.clientName());
        contract.setAgentId(cmd.agentId() != null && !cmd.agentId().isBlank()
                ? cmd.agentId()
                : contracts.agentOfActiveReservation(cmd.propertyId()).orElse(null));
        contract.setContractType(cmd.contractType());
        contract.setStatus(ContractStatus.PENDIENTE_FIRMA);
        contract.setTotalAmount(cmd.totalAmount());
        contract.setDownPayment(cmd.downPayment());
        contract.setLegalClauses(cmd.legalClauses() != null && !cmd.legalClauses().isBlank() ? cmd.legalClauses() : ContractRules.DEFAULT_CLAUSES);
        return contracts.save(contract);
    }

    @Override
    @Transactional
    public Contract cancel(Long id, String reason) {
        Contract contract = getById(id);
        ContractRules.ensureCanBeCancelled(contract.getStatus());
        log.warn("Anulando contrato #{} por motivo: {}", contract.getContractNumber(), reason);
        contract.setStatus(ContractStatus.CANCELADO);
        contract.setCancellationReason(reason);
        return contracts.save(contract);
    }

    // ---------------- CU12: firma digital ----------------

    @Override
    @Transactional
    public Contract sign(Long id, Caller signer) {
        Contract contract = getById(id);
        boolean isClient = signer.isClient();
        String expectedRole = isClient ? ContractRules.SIGNER_CLIENT : ContractRules.SIGNER_LEGAL;
        if (contract.getStatus() == ContractStatus.PENDIENTE_FIRMA) {
            ContractRules.ensureOwner(isClient, contract.getClientId(), signer.id(), "Solo el titular del contrato puede firmarlo");
        }
        String signerRole = ContractRules.signerRoleFor(contract.getStatus(), isClient, contract.hasSignatureFrom(expectedRole));

        LocalDateTime now = LocalDateTime.now();
        String hash = ContractRules.documentHash(contract.getContractNumber(), contract.getClientId(), contract.getPropertyId(),
                contract.getTotalAmount(), contract.getDownPayment(), contract.getLegalClauses(), signer.id(), now);
        contract.getSignatures().add(new ContractSignature(signer.id(), signer.name(), signerRole, hash, now));
        contract.setSignedBy(contract.getSignatures().stream()
                .map(sig -> ContractRules.signerLabel(sig.getSignerName(), sig.getSignerRole()))
                .collect(Collectors.joining(", ")));
        contract.setStatus(ContractRules.statusAfterSignatures(contract.getStatus(),
                contract.hasSignatureFrom(ContractRules.SIGNER_CLIENT), contract.hasSignatureFrom(ContractRules.SIGNER_LEGAL)));
        Contract saved = contracts.save(contract);

        // Con el contrato definitivo firmado, el pre-contrato de arras del inmueble se cumplió: pasa a CONCLUIDO.
        if (ContractRules.definitiveContractSigned(contract.getContractType() == ContractType.RESERVA_CON_ARRAS, saved.getStatus())) {
            for (Contract arras : contracts.findActiveReservationContracts(saved.getPropertyId())) {
                arras.setStatus(ContractStatus.CONCLUIDO);
                arras.setCancellationReason(ContractRules.conclusionNote(saved.getContractNumber()));
                contracts.save(arras);
                log.info("Pre-contrato {} concluido por la firma de {}", arras.getContractNumber(), saved.getContractNumber());
            }
        }
        return saved;
    }

    // ---------------- Saga de reserva (CU14 / CU15) ----------------

    // SAGA PASO 3: pre-contrato de reserva con arras. Si el que reserva es un cliente, el titular sale de su token.
    @Override
    @Transactional
    public Contract generatePreContract(PreContractCommand cmd, Caller caller) {
        String clientId = caller.isClient() ? caller.id() : cmd.clientId();
        String clientName = caller.isClient() ? caller.name() : cmd.clientName();
        log.info("[SAGA STEP 3] Generando Pre-Contrato para Propiedad #{} y Cliente {}", cmd.propertyId(), clientId);

        try {
            ContractRules.ensureClientNotRestricted(clientId);
        } catch (IllegalStateException e) {
            log.error("[SAGA STEP 3 FALLO] El cliente {} se encuentra observado en registros notariales.", clientId);
            throw e;
        }
        ContractRules.ensureNoActiveContract(contracts.propertyHasActiveContract(cmd.propertyId()), cmd.propertyId());

        Contract contract = new Contract();
        contract.setContractNumber(ContractRules.newContractNumber("ARRAS"));
        contract.setPropertyId(cmd.propertyId());
        contract.setPropertyTitle(cmd.propertyTitle());
        contract.setClientId(clientId);
        contract.setUserName(clientName);
        contract.setAgentId(cmd.agentId() != null ? cmd.agentId() : "BROKER-DEFAULT");
        contract.setContractType(ContractType.RESERVA_CON_ARRAS);
        contract.setStatus(ContractStatus.PENDIENTE_FIRMA);
        contract.setPaymentReferenceId(cmd.paymentReferenceId());
        contract.setTotalAmount(cmd.totalAmount());
        contract.setDownPayment(cmd.depositAmount());
        contract.setLegalClauses(ContractRules.reservationClauses(clientName, clientId, cmd.propertyTitle(), cmd.propertyId(),
                cmd.paymentReferenceId(), cmd.depositAmount()));
        Contract saved = contracts.save(contract);
        log.info("[SAGA STEP 3 ÉXITO] Pre-contrato #{} generado en PostgreSQL", saved.getContractNumber());
        return saved;
    }

    // CU15: al cancelar una reserva se anula su pre-contrato de arras (idempotente).
    @Override
    @Transactional
    public Contract cancelForReservation(String paymentReferenceId, String reason, Caller caller) {
        Contract contract = contracts.findByPaymentReference(paymentReferenceId, ContractType.RESERVA_CON_ARRAS)
                .orElseThrow(() -> new NoSuchElementException("No hay pre-contrato de arras para el cobro " + paymentReferenceId));
        ContractRules.ensureOwner(caller.isClient(), contract.getClientId(), caller.id(), "Solo el titular puede cancelar su reserva");
        if (ContractRules.isClosed(contract.getStatus())) {
            return contract;
        }
        log.warn("Anulando pre-contrato {} por cancelación de la reserva: {}", contract.getContractNumber(), reason);
        contract.setStatus(ContractStatus.CANCELADO);
        contract.setCancellationReason(reason);
        return contracts.save(contract);
    }

    private Contract getById(Long id) {
        return contracts.findById(id).orElseThrow(() -> new NoSuchElementException("Contrato #" + id + " no encontrado"));
    }

    // Datos de muestra si la tabla está vacía (igual que antes del refactor).
    @PostConstruct
    public void seedInitialContracts() {
        if (contracts.count() == 0) {
            log.info("Sembrando contratos iniciales de muestra en PostgreSQL...");
            create(new CreateContractCommand("DEP-VALLE-101", null, "CLI-CARLOS-GOMEZ", null, "AGT-MARIA-ROCA",
                    ContractType.PROMESA_COMPRAVENTA, new BigDecimal("245000.00"), new BigDecimal("5000.00"),
                    "Contrato estándar de compraventa con promesa de escrituración."));
        }
    }
}
