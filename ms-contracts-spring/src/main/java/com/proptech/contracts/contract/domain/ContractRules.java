package com.proptech.contracts.contract.domain;

import com.proptech.contracts.model.ContractStatus;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * HEXAGONAL — Núcleo de dominio del contexto Contratos: reglas de negocio puras.
 * No importa Spring, JPA ni HTTP: se puede probar y reutilizar sin el framework. La capa de aplicación
 * la usa a través de los puertos; los adaptadores (web, JPA) nunca contienen reglas.
 */
public final class ContractRules {

    public static final String SIGNER_CLIENT = "CLIENTE";
    public static final String SIGNER_LEGAL = "LEGAL";
    public static final String DEFAULT_CLAUSES =
            "Cláusula 1: Ambas partes declaran personería legal plena. Cláusula 2: El precio pactado es inamovible.";

    /** Estados que ya no cuentan como contrato activo del inmueble. */
    public static final List<ContractStatus> CLOSED_STATUSES = List.of(ContractStatus.CANCELADO, ContractStatus.RECHAZADO, ContractStatus.CONCLUIDO);

    private ContractRules() {}

    public static String newContractNumber(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    /** Control notarial simulado: un cliente observado no puede reservar (dispara la compensación de la saga). */
    public static void ensureClientNotRestricted(String clientId) {
        if ("CLIENTE_RESTRINGIDO".equalsIgnoreCase(clientId)) {
            throw new ContractRuleViolation("Validación Notarial Rechazada: El cliente posee observaciones legales vigentes.");
        }
    }

    /** Una reserva nueva no puede convivir con ningún contrato activo del inmueble. */
    public static void ensureNoActiveContract(boolean propertyHasActiveContract, String propertyId) {
        if (propertyHasActiveContract) {
            throw new ContractRuleViolation("El inmueble " + propertyId + " ya tiene un contrato activo. Anúlalo antes de generar otro.");
        }
    }

    /** El contrato definitivo puede seguir a un pre-contrato de arras, pero no a otro contrato definitivo activo. */
    public static void ensureNoActiveDefinitiveContract(boolean propertyHasActiveDefinitive, String propertyId) {
        if (propertyHasActiveDefinitive) {
            throw new ContractRuleViolation("El inmueble " + propertyId + " ya tiene un contrato definitivo activo. Anúlalo antes de generar otro.");
        }
    }

    public static void ensureCanBeCancelled(ContractStatus status) {
        if (status == ContractStatus.CANCELADO) {
            throw new ContractRuleViolation("El contrato ya está anulado");
        }
        if (status == ContractStatus.CONCLUIDO) {
            throw new ContractRuleViolation("El pre-contrato ya se concluyó con la firma del contrato definitivo");
        }
    }

    /**
     * Un pre-contrato de arras se cumple cuando el contrato definitivo (compraventa o alquiler) del mismo
     * inmueble queda FIRMADO: las arras ya cumplieron su función y el pre-contrato pasa a CONCLUIDO.
     */
    public static boolean definitiveContractSigned(boolean isReservationContract, ContractStatus statusAfterSigning) {
        return !isReservationContract && statusAfterSigning == ContractStatus.FIRMADO;
    }

    public static String conclusionNote(String definitiveContractNumber) {
        return "Concluido: se firmó el contrato definitivo " + definitiveContractNumber;
    }

    public static boolean isClosed(ContractStatus status) {
        return CLOSED_STATUSES.contains(status);
    }

    /** Solo el titular (o el personal) accede al contrato. */
    public static void ensureOwner(boolean callerIsClient, String contractClientId, String callerId, String message) {
        if (callerIsClient && !contractClientId.equals(callerId)) {
            throw new ContractAccessDenied(message);
        }
    }

    /** Firma digital (CU12): solo contratos pendientes, una firma por parte (cliente titular y Oficial Legal). */
    public static String signerRoleFor(ContractStatus status, boolean callerIsClient, boolean alreadySigned) {
        if (status != ContractStatus.PENDIENTE_FIRMA) {
            throw new ContractRuleViolation("Solo se firman contratos pendientes de firma (estado actual: " + status + ")");
        }
        if (alreadySigned) {
            throw new ContractRuleViolation(callerIsClient ? "Ya firmaste este contrato" : "El contrato ya tiene la firma del Oficial Legal");
        }
        return callerIsClient ? SIGNER_CLIENT : SIGNER_LEGAL;
    }

    /** Con la firma del cliente y la del Oficial Legal (fe pública) el contrato queda FIRMADO. */
    public static ContractStatus statusAfterSignatures(ContractStatus current, boolean clientSigned, boolean legalSigned) {
        return clientSigned && legalSigned ? ContractStatus.FIRMADO : current;
    }

    public static String signerLabel(String signerName, String signerRole) {
        return signerName + (SIGNER_LEGAL.equals(signerRole) ? " (Oficial Legal)" : " (Cliente)");
    }

    /** Huella SHA-256 del contenido firmado (número, partes, montos, cláusulas, firmante y fecha). */
    public static String documentHash(String contractNumber, String clientId, String propertyId, BigDecimal total,
                                      BigDecimal downPayment, String clauses, String signerId, LocalDateTime signedAt) {
        String content = String.join("|", contractNumber, clientId, propertyId, plain(total), plain(downPayment),
                String.valueOf(clauses), signerId, signedAt.toString());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }

    /** Cláusulas del pre-contrato de reserva con arras (saga paso 3). */
    public static String reservationClauses(String clientName, String clientId, String propertyTitle, String propertyId,
                                            String paymentReferenceId, BigDecimal depositAmount) {
        return "CONTRATO PRIVADO DE PROMESA DE COMPRAVENTA CON RESERVA DE ARRAS.\n" +
                "1. Partes: Vendedor (Propietario) y Comprador (" + (clientName != null ? clientName : "Cliente #" + clientId) + ").\n" +
                "2. Inmueble: " + (propertyTitle != null ? propertyTitle + " — " : "") + "Ficha de Registro #" + propertyId + ".\n" +
                "3. Arras Penitenciales: Se ha recibido el pago de garantía ref #" + paymentReferenceId + " por " + depositAmount + " USD.\n" +
                "4. Plazo de Escrituración: 30 días hábiles posteriores al depósito.";
    }

    private static String plain(BigDecimal value) {
        return value != null ? value.toPlainString() : "0";
    }
}
