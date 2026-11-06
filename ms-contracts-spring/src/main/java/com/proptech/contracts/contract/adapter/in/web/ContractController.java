package com.proptech.contracts.contract.adapter.in.web;

import com.proptech.contracts.contract.application.port.in.*;
import com.proptech.contracts.dto.ContractDtos.CancelContractRequest;
import com.proptech.contracts.dto.ContractDtos.CreateContractRequest;
import com.proptech.contracts.dto.ContractDtos.PreContractSagaRequest;
import com.proptech.contracts.model.Contract;
import com.proptech.contracts.model.User;
import com.proptech.contracts.security.KeycloakClaims;
import com.proptech.contracts.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * HEXAGONAL — Adaptador de entrada (driving): traduce HTTP + token de Keycloak a llamadas a los puertos de
 * entrada (casos de uso). No tiene reglas de negocio. Rutas y JSON idénticos a los de antes del refactor.
 */
@RestController
@RequestMapping("/api/v1/contracts")
@CrossOrigin(origins = "*")
public class ContractController {

    private final QueryContractsUseCase queryContracts;
    private final GenerateContractUseCase generateContract;
    private final SignContractUseCase signContract;
    private final CancelContractUseCase cancelContract;
    private final ReservationContractUseCase reservationContracts;
    private final UserService userService;

    public ContractController(QueryContractsUseCase queryContracts, GenerateContractUseCase generateContract,
                              SignContractUseCase signContract, CancelContractUseCase cancelContract,
                              ReservationContractUseCase reservationContracts, UserService userService) {
        this.queryContracts = queryContracts;
        this.generateContract = generateContract;
        this.signContract = signContract;
        this.cancelContract = cancelContract;
        this.reservationContracts = reservationContracts;
        this.userService = userService;
    }

    // Quién llama: perfil de PostgreSQL (sincronizado desde Keycloak) + rol efectivo del token.
    private Caller caller(Jwt jwt) {
        User user = userService.currentUser(jwt);
        return new Caller(user.getId(), user.getName(), KeycloakClaims.effectiveRole(jwt));
    }

    @GetMapping
    public ResponseEntity<List<Contract>> getContracts(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(queryContracts.list(caller(jwt)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Contract> getContractById(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(queryContracts.getVisible(id, caller(jwt)));
    }

    @PostMapping
    public ResponseEntity<Contract> createContract(@Valid @RequestBody CreateContractRequest req) {
        CreateContractCommand cmd = new CreateContractCommand(req.getPropertyId(), req.getPropertyTitle(), req.getClientId(),
                req.getClientName(), req.getAgentId(), req.getContractType(), req.getTotalAmount(), req.getDownPayment(), req.getLegalClauses());
        return new ResponseEntity<>(generateContract.create(cmd), HttpStatus.CREATED);
    }

    // SAGA PASO 3: un 422 dispara la compensación en el orquestador
    @PostMapping("/pre-contract")
    public ResponseEntity<?> generatePreContractSaga(@Valid @RequestBody PreContractSagaRequest req, @AuthenticationPrincipal Jwt jwt) {
        PreContractCommand cmd = new PreContractCommand(req.getPropertyId(), req.getPropertyTitle(), req.getClientId(), req.getClientName(),
                req.getAgentId(), req.getPaymentReferenceId(), req.getTotalAmount(), req.getDepositAmount());
        try {
            return new ResponseEntity<>(reservationContracts.generatePreContract(cmd, caller(jwt)), HttpStatus.CREATED);
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
        return ResponseEntity.ok(cancelContract.cancel(id, req.getReason()));
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
        return ResponseEntity.ok(reservationContracts.cancelForReservation(paymentId, reason, caller(jwt)));
    }

    @PostMapping("/{id}/signatures")
    public ResponseEntity<Contract> signContract(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(signContract.sign(id, caller(jwt)));
    }
}
