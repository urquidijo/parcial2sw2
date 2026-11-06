package com.proptech.contracts.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** Descripción de la arquitectura interna de este microservicio (la muestra el modo demo del portal). */
@RestController
@CrossOrigin(origins = "*")
public class ArchitectureController {

    @GetMapping("/api/v1/architecture")
    public ResponseEntity<?> describe() {
        return ResponseEntity.ok(Map.of(
                "service", "ms-contracts",
                "technology", "Spring Boot 3.3 (Java 21) + PostgreSQL",
                "architecture", "Hexagonal (puertos y adaptadores)",
                "boundedContext", "Contratos (CU11 generar y anular, CU12 firmar, pre-contrato de la saga CU14/CU15)",
                "layers", List.of(
                        Map.of("name", "Dominio", "path", "contract/domain/", "items", List.of(
                                "ContractRules: reglas puras sin Spring ni JPA (firma, anulación, un contrato activo por inmueble, hash del documento)",
                                "Excepciones de dominio ContractRuleViolation y ContractAccessDenied")),
                        Map.of("name", "Puertos de entrada (casos de uso)", "path", "contract/application/port/in/", "items", List.of(
                                "QueryContractsUseCase", "GenerateContractUseCase", "SignContractUseCase", "CancelContractUseCase", "ReservationContractUseCase")),
                        Map.of("name", "Puerto de salida", "path", "contract/application/port/out/", "items", List.of(
                                "ContractRepositoryPort (lo que el núcleo necesita de la persistencia)")),
                        Map.of("name", "Aplicación", "path", "contract/application/ContractApplicationService.java", "items", List.of(
                                "Implementa los casos de uso usando solo puertos y reglas del dominio")),
                        Map.of("name", "Adaptador de entrada", "path", "contract/adapter/in/web/", "items", List.of(
                                "ContractController REST: HTTP + token → casos de uso (mismas rutas y JSON)")),
                        Map.of("name", "Adaptador de salida", "path", "contract/adapter/out/persistence/", "items", List.of(
                                "ContractPersistenceAdapter: Spring Data JPA → PostgreSQL (Render)"))),
                "rule", "Las dependencias apuntan hacia el núcleo: los adaptadores conocen los puertos; el dominio no conoce a nadie."));
    }
}
