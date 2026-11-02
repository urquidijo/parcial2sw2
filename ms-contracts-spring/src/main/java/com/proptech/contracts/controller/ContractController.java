package com.proptech.contracts.controller;

import com.proptech.contracts.dto.ContractDtos.CancelContractRequest;
import com.proptech.contracts.dto.ContractDtos.CreateContractRequest;
import com.proptech.contracts.dto.ContractDtos.PreContractSagaRequest;
import com.proptech.contracts.model.Contract;
import com.proptech.contracts.security.KeycloakClaims;
import com.proptech.contracts.service.ContractService;
import com.proptech.contracts.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/contracts")
@CrossOrigin(origins = "*")
public class ContractController {

    private final ContractService contractService;
    private final UserService userService;

    public ContractController(ContractService contractService, UserService userService) {
        this.contractService = contractService;
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<List<Contract>> getContracts(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(contractService.getContracts(userService.currentUser(jwt), KeycloakClaims.effectiveRole(jwt)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Contract> getContractById(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(contractService.getVisibleContract(id, userService.currentUser(jwt), KeycloakClaims.effectiveRole(jwt)));
    }

    @PostMapping
    public ResponseEntity<Contract> createContract(@Valid @RequestBody CreateContractRequest req) {
        return new ResponseEntity<>(contractService.createContract(req), HttpStatus.CREATED);
    }

    // SAGA PASO 3: un 422 dispara la compensación en el orquestador
    @PostMapping("/pre-contract")
    public ResponseEntity<?> generatePreContractSaga(@Valid @RequestBody PreContractSagaRequest req, @AuthenticationPrincipal Jwt jwt) {
        try {
            Contract contract = contractService.generatePreContractSaga(req, userService.currentUser(jwt), KeycloakClaims.effectiveRole(jwt));
            return new ResponseEntity<>(contract, HttpStatus.CREATED);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of(
                    "success", false,
                    "error", "VALIDACION_LEGAL_FALLIDA",
                    "message", e.getMessage()
            ));
        }
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<Contract> cancelContract(@PathVariable Long id, @Valid @RequestBody CancelContractRequest req) {
        return ResponseEntity.ok(contractService.cancelContract(id, req.getReason()));
    }

    // CU15: lo llama el gateway al cancelar una reserva; {paymentId} es la referencia del cobro de arras.
    @PostMapping("/reservations/{paymentId}/cancel")
    public ResponseEntity<Contract> cancelReservationContract(@PathVariable String paymentId,
                                                              @RequestBody(required = false) Map<String, String> body,
                                                              @AuthenticationPrincipal Jwt jwt) {
        String reason = body != null && body.get("reason") != null && !body.get("reason").isBlank()
                ? body.get("reason").trim()
                : "Reserva cancelada con reembolso de arras";
        if (reason.length() > 500) reason = reason.substring(0, 500);
        return ResponseEntity.ok(contractService.cancelReservationContract(paymentId, reason,
                userService.currentUser(jwt), KeycloakClaims.effectiveRole(jwt)));
    }

    @PostMapping("/{id}/signatures")
    public ResponseEntity<Contract> signContract(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(contractService.signContract(id, userService.currentUser(jwt), KeycloakClaims.effectiveRole(jwt)));
    }
}
