package com.proptech.contracts.service;

import com.proptech.contracts.dto.ContractDtos.*;
import com.proptech.contracts.model.Contract;
import com.proptech.contracts.model.ContractStatus;
import com.proptech.contracts.model.ContractType;
import com.proptech.contracts.repository.ContractRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
public class ContractService {

    private static final Logger log = LoggerFactory.getLogger(ContractService.name);
    private final ContractRepository contractRepository;

    public ContractService(ContractRepository contractRepository) {
        this.contractRepository = contractRepository;
    }

    @Transactional(readOnly = true)
    public List<Contract> getAllContracts() {
        return contractRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Contract getContractById(Long id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Contrato #" + id + " no encontrado"));
    }

    @Transactional
    public Contract createContract(CreateContractRequest req) {
        Contract contract = new Contract();
        contract.setContractNumber("CTR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        contract.setPropertyId(req.getPropertyId());
        contract.setClientId(req.getClientId());
        contract.setAgentId(req.getAgentId());
        contract.setContractType(req.getContractType());
        contract.setStatus(ContractStatus.BORRADOR);
        contract.setTotalAmount(req.getTotalAmount());
        contract.setDownPayment(req.getDownPayment());
        contract.setLegalClauses(req.getLegalClauses() != null ? req.getLegalClauses() :
                "Cláusula 1: Ambas partes declaran personería legal plena. Cláusula 2: El precio pactado es inamovible.");

        return contractRepository.save(contract);
    }

    /**
     * SAGA PASO 3: Generación de pre-contrato de reserva y promesa de compraventa.
     */
    @Transactional
    public Contract generatePreContractSaga(PreContractSagaRequest req) {
        log.info("[SAGA STEP 3] Generando Pre-Contrato para Propiedad #{} y Cliente {}", req.getPropertyId(), req.getClientId());

        // Simulación de control legal / lista restrictiva notarial:
        if ("CLIENTE_RESTRINGIDO".equalsIgnoreCase(req.getClientId())) {
            log.error("[SAGA STEP 3 FALLO] El cliente {} se encuentra observado en registros notariales. Disparando compensación en cadena.", req.getClientId());
            throw new IllegalStateException("Validación Notarial Rechazada: El cliente posee observaciones legales vigentes.");
        }

        Contract contract = new Contract();
        contract.setContractNumber("ARRAS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        contract.setPropertyId(req.getPropertyId());
        contract.setClientId(req.getClientId());
        contract.setAgentId(req.getAgentId() != null ? req.getAgentId() : "BROKER-DEFAULT");
        contract.setContractType(ContractType.RESERVA_CON_ARRAS);
        contract.setStatus(ContractStatus.PENDIENTE_FIRMA);
        contract.setPaymentReferenceId(req.getPaymentReferenceId());
        contract.setTotalAmount(req.getTotalAmount());
        contract.setDownPayment(req.getDepositAmount());
        contract.setLegalClauses(
                "CONTRATO PRIVADO DE PROMESA DE COMPRAVENTA CON RESERVA DE ARRAS.\n" +
                "1. Partes: Vendedor (Propietario) y Comprador (Cliente #" + req.getClientId() + ").\n" +
                "2. Inmueble: Ficha de Registro #" + req.getPropertyId() + ".\n" +
                "3. Arras Penitenciales: Se ha recibido el pago de garantía ref #" + req.getPaymentReferenceId() + " por " + req.getDepositAmount() + " USD.\n" +
                "4. Plazo de Escrituración: 30 días hábiles posteriores al depósito."
        );

        Contract saved = contractRepository.save(contract);
        log.info("[SAGA STEP 3 ÉXITO] Pre-contrato #{} generado exitosamente en PostgreSQL", saved.getContractNumber());
        return saved;
    }

    /**
     * SAGA COMPENSACIÓN: Anulación o cancelación formal de contrato
     */
    @Transactional
    public Contract cancelContract(Long id, String reason) {
        log.warn("[SAGA COMPENSACIÓN STEP 3] Cancelando contrato #{} por motivo: {}", id, reason);
        Contract contract = getContractById(id);
        contract.setStatus(ContractStatus.CANCELADO);
        contract.setCancellationReason(reason != null ? reason : "Compensación Saga por fallo transaccional");
        return contractRepository.save(contract);
    }

    @Transactional
    public Contract signContract(Long id, SignContractRequest req) {
        Contract contract = getContractById(id);
        contract.setStatus(ContractStatus.FIRMADO);
        contract.setLegalClauses(contract.getLegalClauses() + "\n[FIRMADO DIGITALMENTE POR: " + req.getSignerName() + " | HASH: " + req.getCertificateHash() + "]");
        return contractRepository.save(contract);
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
            log.info("1 contrato de muestra sembrado en PostgreSQL.");
        }
    }
}
