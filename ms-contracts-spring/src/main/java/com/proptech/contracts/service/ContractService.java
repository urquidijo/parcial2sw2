package com.proptech.contracts.service;

import com.proptech.contracts.dto.ContractDtos.CreateContractRequest;
import com.proptech.contracts.dto.ContractDtos.PreContractSagaRequest;
import com.proptech.contracts.model.*;
import com.proptech.contracts.repository.ContractRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ContractService {

    private static final Logger log = LoggerFactory.getLogger(ContractService.class);
    private static final List<ContractStatus> CLOSED_STATUSES = List.of(ContractStatus.CANCELADO, ContractStatus.RECHAZADO);

    private final ContractRepository contractRepository;

    public ContractService(ContractRepository contractRepository) {
        this.contractRepository = contractRepository;
    }

    // El cliente ve solo sus contratos; el personal ve todos.
    @Transactional(readOnly = true)
    public List<Contract> getContracts(User user, String role) {
        if (User.ROLE_CLIENTE.equals(role)) {
            return contractRepository.findByClientIdOrderByCreatedAtDesc(user.getId());
        }
        return contractRepository.findAllByOrderByCreatedAtDesc();
    }

    @Transactional(readOnly = true)
    public Contract getContractById(Long id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Contrato #" + id + " no encontrado"));
    }

    @Transactional(readOnly = true)
    public Contract getVisibleContract(Long id, User user, String role) {
        Contract contract = getContractById(id);
        if (User.ROLE_CLIENTE.equals(role) && !contract.getClientId().equals(user.getId())) {
            throw new AccessDeniedException("Solo puedes ver tus propios contratos");
        }
        return contract;
    }

    // CU11: el Oficial Legal genera el contrato de compraventa o alquiler, listo para firmar.
    @Transactional
    public Contract createContract(CreateContractRequest req) {
        ensureNoActiveDefinitiveContract(req.getPropertyId());
        Contract contract = new Contract();
        contract.setContractNumber("CTR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        contract.setPropertyId(req.getPropertyId());
        contract.setPropertyTitle(req.getPropertyTitle());
        contract.setClientId(req.getClientId());
        contract.setUserName(req.getClientName());
        contract.setAgentId(req.getAgentId() != null && !req.getAgentId().isBlank() ? req.getAgentId() : agentOfActiveReservation(req.getPropertyId()));
        contract.setContractType(req.getContractType());
        contract.setStatus(ContractStatus.PENDIENTE_FIRMA);
        contract.setTotalAmount(req.getTotalAmount());
        contract.setDownPayment(req.getDownPayment());
        contract.setLegalClauses(req.getLegalClauses() != null && !req.getLegalClauses().isBlank() ? req.getLegalClauses() :
                "Cláusula 1: Ambas partes declaran personería legal plena. Cláusula 2: El precio pactado es inamovible.");
        return contractRepository.save(contract);
    }

    // SAGA PASO 3: pre-contrato de reserva con arras. Si el que reserva es un cliente, el titular sale de su token.
    @Transactional
    public Contract generatePreContractSaga(PreContractSagaRequest req, User caller, String role) {
        String clientId = User.ROLE_CLIENTE.equals(role) ? caller.getId() : req.getClientId();
        String clientName = User.ROLE_CLIENTE.equals(role) ? caller.getName() : req.getClientName();
        log.info("[SAGA STEP 3] Generando Pre-Contrato para Propiedad #{} y Cliente {}", req.getPropertyId(), clientId);

        // Simulación de control legal / lista restrictiva notarial
        if ("CLIENTE_RESTRINGIDO".equalsIgnoreCase(clientId)) {
            log.error("[SAGA STEP 3 FALLO] El cliente {} se encuentra observado en registros notariales.", clientId);
            throw new IllegalStateException("Validación Notarial Rechazada: El cliente posee observaciones legales vigentes.");
        }
        ensureNoActiveContract(req.getPropertyId());

        Contract contract = new Contract();
        contract.setContractNumber("ARRAS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        contract.setPropertyId(req.getPropertyId());
        contract.setPropertyTitle(req.getPropertyTitle());
        contract.setClientId(clientId);
        contract.setUserName(clientName);
        contract.setAgentId(req.getAgentId() != null ? req.getAgentId() : "BROKER-DEFAULT");
        contract.setContractType(ContractType.RESERVA_CON_ARRAS);
        contract.setStatus(ContractStatus.PENDIENTE_FIRMA);
        contract.setPaymentReferenceId(req.getPaymentReferenceId());
        contract.setTotalAmount(req.getTotalAmount());
        contract.setDownPayment(req.getDepositAmount());
        contract.setLegalClauses(
                "CONTRATO PRIVADO DE PROMESA DE COMPRAVENTA CON RESERVA DE ARRAS.\n" +
                "1. Partes: Vendedor (Propietario) y Comprador (" + (clientName != null ? clientName : "Cliente #" + clientId) + ").\n" +
                "2. Inmueble: " + (req.getPropertyTitle() != null ? req.getPropertyTitle() + " — " : "") + "Ficha de Registro #" + req.getPropertyId() + ".\n" +
                "3. Arras Penitenciales: Se ha recibido el pago de garantía ref #" + req.getPaymentReferenceId() + " por " + req.getDepositAmount() + " USD.\n" +
                "4. Plazo de Escrituración: 30 días hábiles posteriores al depósito."
        );
        Contract saved = contractRepository.save(contract);
        log.info("[SAGA STEP 3 ÉXITO] Pre-contrato #{} generado en PostgreSQL", saved.getContractNumber());
        return saved;
    }

    @Transactional
    public Contract cancelContract(Long id, String reason) {
        Contract contract = getContractById(id);
        if (contract.getStatus() == ContractStatus.CANCELADO) {
            throw new IllegalStateException("El contrato ya está anulado");
        }
        log.warn("Anulando contrato #{} por motivo: {}", contract.getContractNumber(), reason);
        contract.setStatus(ContractStatus.CANCELADO);
        contract.setCancellationReason(reason);
        return contractRepository.save(contract);
    }

    // CU15: al cancelar una reserva se anula su pre-contrato de arras (se ubica por la referencia del cobro).
    // Es idempotente: si ya estaba anulado lo devuelve tal cual.
    @Transactional
    public Contract cancelReservationContract(String paymentReferenceId, String reason, User caller, String role) {
        Contract contract = contractRepository.findFirstByPaymentReferenceIdAndContractType(paymentReferenceId, ContractType.RESERVA_CON_ARRAS)
                .orElseThrow(() -> new NoSuchElementException("No hay pre-contrato de arras para el cobro " + paymentReferenceId));
        if (User.ROLE_CLIENTE.equals(role) && !contract.getClientId().equals(caller.getId())) {
            throw new AccessDeniedException("Solo el titular puede cancelar su reserva");
        }
        if (CLOSED_STATUSES.contains(contract.getStatus())) {
            return contract;
        }
        log.warn("Anulando pre-contrato {} por cancelación de la reserva: {}", contract.getContractNumber(), reason);
        contract.setStatus(ContractStatus.CANCELADO);
        contract.setCancellationReason(reason);
        return contractRepository.save(contract);
    }

    // El contrato definitivo hereda el agente de la reserva vigente del inmueble (para su comisión, CU17).
    private String agentOfActiveReservation(String propertyId) {
        return contractRepository
                .findFirstByPropertyIdAndContractTypeAndStatusNotInOrderByCreatedAtDesc(propertyId, ContractType.RESERVA_CON_ARRAS, CLOSED_STATUSES)
                .map(Contract::getAgentId)
                .orElse(null);
    }

    // CU12: firma digital simulada. Firman el cliente titular y el Oficial Legal (fe pública); con ambas queda FIRMADO.
    @Transactional
    public Contract signContract(Long id, User signer, String role) {
        Contract contract = getContractById(id);
        if (contract.getStatus() != ContractStatus.PENDIENTE_FIRMA) {
            throw new IllegalStateException("Solo se firman contratos pendientes de firma (estado actual: " + contract.getStatus() + ")");
        }
        boolean isClient = User.ROLE_CLIENTE.equals(role);
        if (isClient && !contract.getClientId().equals(signer.getId())) {
            throw new AccessDeniedException("Solo el titular del contrato puede firmarlo");
        }
        String signerRole = isClient ? ContractSignature.ROLE_CLIENTE : ContractSignature.ROLE_LEGAL;
        if (contract.hasSignatureFrom(signerRole)) {
            throw new IllegalStateException(isClient ? "Ya firmaste este contrato" : "El contrato ya tiene la firma del Oficial Legal");
        }

        LocalDateTime now = LocalDateTime.now();
        contract.getSignatures().add(new ContractSignature(signer.getId(), signer.getName(), signerRole, documentHash(contract, signer.getId(), now), now));
        contract.setSignedBy(contract.getSignatures().stream()
                .map(sig -> sig.getSignerName() + (ContractSignature.ROLE_LEGAL.equals(sig.getSignerRole()) ? " (Oficial Legal)" : " (Cliente)"))
                .collect(Collectors.joining(", ")));
        if (contract.hasSignatureFrom(ContractSignature.ROLE_CLIENTE) && contract.hasSignatureFrom(ContractSignature.ROLE_LEGAL)) {
            contract.setStatus(ContractStatus.FIRMADO);
        }
        return contractRepository.save(contract);
    }

    // Una reserva nueva no puede convivir con ningún contrato activo del inmueble.
    private void ensureNoActiveContract(String propertyId) {
        if (contractRepository.existsByPropertyIdAndStatusNotIn(propertyId, CLOSED_STATUSES)) {
            throw new IllegalStateException("El inmueble " + propertyId + " ya tiene un contrato activo. Anúlalo antes de generar otro.");
        }
    }

    // El contrato definitivo puede seguir a un pre-contrato de arras, pero no a otro contrato definitivo activo.
    private void ensureNoActiveDefinitiveContract(String propertyId) {
        if (contractRepository.existsByPropertyIdAndContractTypeNotAndStatusNotIn(propertyId, ContractType.RESERVA_CON_ARRAS, CLOSED_STATUSES)) {
            throw new IllegalStateException("El inmueble " + propertyId + " ya tiene un contrato definitivo activo. Anúlalo antes de generar otro.");
        }
    }

    private static String documentHash(Contract c, String signerId, LocalDateTime signedAt) {
        String content = String.join("|", c.getContractNumber(), c.getClientId(), c.getPropertyId(),
                plain(c.getTotalAmount()), plain(c.getDownPayment()), String.valueOf(c.getLegalClauses()), signerId, signedAt.toString());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }

    private static String plain(BigDecimal value) {
        return value != null ? value.toPlainString() : "0";
    }

    @PostConstruct
    public void seedInitialContracts() {
        if (contractRepository.count() == 0) {
            log.info("Sembrando contratos iniciales de muestra en PostgreSQL...");
            CreateContractRequest c1 = new CreateContractRequest();
            c1.setPropertyId("DEP-VALLE-101");
            c1.setClientId("CLI-CARLOS-GOMEZ");
            c1.setAgentId("AGT-MARIA-ROCA");
            c1.setContractType(ContractType.PROMESA_COMPRAVENTA);
            c1.setTotalAmount(new BigDecimal("245000.00"));
            c1.setDownPayment(new BigDecimal("5000.00"));
            c1.setLegalClauses("Contrato estándar de compraventa con promesa de escrituración.");
            createContract(c1);
        }
    }
}
