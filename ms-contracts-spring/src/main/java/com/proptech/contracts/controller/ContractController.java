package com.proptech.contracts.controller;

import com.proptech.contracts.dto.ContractDtos.*;
import com.proptech.contracts.model.Contract;
import com.proptech.contracts.service.ContractService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/contracts")
@CrossOrigin(origins = "*")
public class ContractController {

    private final ContractService contractService;

    public ContractController(ContractService contractService) {
        this.contractService = contractService;
    }

    @GetMapping
    public ResponseEntity<List<Contract>> getAllContracts() {
        return ResponseEntity.ok(contractService.getAllContracts());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Contract> getContractById(@PathVariable Long id) {
        return ResponseEntity.ok(contractService.getContractById(id));
    }

    @PostMapping
    public ResponseEntity<Contract> createContract(@Valid @RequestBody CreateContractRequest req) {
        return new ResponseEntity<>(contractService.createContract(req), HttpStatus.CREATED);
    }

    /**
     * SAGA PASO 3: Generación de pre-contrato de reserva con arras
     */
    @PostMapping("/pre-contract")
    public ResponseEntity<?> generatePreContractSaga(@Valid @RequestBody PreContractSagaRequest req) {
        try {
            Contract contract = contractService.generatePreContractSaga(req);
            return new ResponseEntity<>(contract, HttpStatus.CREATED);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of(
                    "success", false,
                    "error", "VALIDACION_LEGAL_FALLIDA",
                    "message", e.getMessage()
            ));
        }
    }

    /**
     * SAGA COMPENSACIÓN: Cancelación de contrato
     */
    @PostMapping("/{id}/cancel")
    public ResponseEntity<Contract> cancelContract(@PathVariable Long id, @RequestBody(required = false) CancelContractRequest req) {
        String reason = req != null ? req.getReason() : "Cancelación por compensación transaccional";
        return ResponseEntity.ok(contractService.cancelContract(id, reason));
    }

    @PostMapping("/{id}/signatures")
    public ResponseEntity<Contract> signContract(@PathVariable Long id, @Valid @RequestBody SignContractRequest req) {
        return ResponseEntity.ok(contractService.signContract(id, req));
    }
}
