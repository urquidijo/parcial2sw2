package com.proptech.contracts.dto;

import com.proptech.contracts.model.ContractType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public class ContractDtos {

    public static class CreateContractRequest {
        @NotBlank(message = "El ID de la propiedad es obligatorio")
        private String propertyId;

        @NotBlank(message = "El ID del cliente es obligatorio")
        private String clientId;

        private String agentId;

        @NotNull(message = "El tipo de contrato es obligatorio")
        private ContractType contractType;

        @NotNull(message = "El monto total es obligatorio")
        @Positive(message = "El monto total debe ser positivo")
        private BigDecimal totalAmount;

        @NotNull(message = "El anticipo o arras es obligatorio")
        @PositiveOrZero(message = "El anticipo no puede ser negativo")
        private BigDecimal downPayment;

        private String legalClauses;

        private String propertyTitle;

        private String clientName;

        // Getters & Setters
        public String getPropertyTitle() { return propertyTitle; }
        public void setPropertyTitle(String propertyTitle) { this.propertyTitle = propertyTitle; }
        public String getClientName() { return clientName; }
        public void setClientName(String clientName) { this.clientName = clientName; }
        public String getPropertyId() { return propertyId; }
        public void setPropertyId(String propertyId) { this.propertyId = propertyId; }

        public String getClientId() { return clientId; }
        public void setClientId(String clientId) { this.clientId = clientId; }

        public String getAgentId() { return agentId; }
        public void setAgentId(String agentId) { this.agentId = agentId; }

        public ContractType getContractType() { return contractType; }
        public void setContractType(ContractType contractType) { this.contractType = contractType; }

        public BigDecimal getTotalAmount() { return totalAmount; }
        public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

        public BigDecimal getDownPayment() { return downPayment; }
        public void setDownPayment(BigDecimal downPayment) { this.downPayment = downPayment; }

        public String getLegalClauses() { return legalClauses; }
        public void setLegalClauses(String legalClauses) { this.legalClauses = legalClauses; }
    }

    public static class PreContractSagaRequest {
        @NotBlank
        private String propertyId;

        @NotBlank
        private String clientId;

        private String agentId;

        @NotBlank
        private String paymentReferenceId;

        @NotNull
        private BigDecimal totalAmount;

        @NotNull
        private BigDecimal depositAmount;

        private String propertyTitle;

        private String clientName;

        public String getPropertyTitle() { return propertyTitle; }
        public void setPropertyTitle(String propertyTitle) { this.propertyTitle = propertyTitle; }
        public String getClientName() { return clientName; }
        public void setClientName(String clientName) { this.clientName = clientName; }

        public String getPropertyId() { return propertyId; }
        public void setPropertyId(String propertyId) { this.propertyId = propertyId; }

        public String getClientId() { return clientId; }
        public void setClientId(String clientId) { this.clientId = clientId; }

        public String getAgentId() { return agentId; }
        public void setAgentId(String agentId) { this.agentId = agentId; }

        public String getPaymentReferenceId() { return paymentReferenceId; }
        public void setPaymentReferenceId(String paymentReferenceId) { this.paymentReferenceId = paymentReferenceId; }

        public BigDecimal getTotalAmount() { return totalAmount; }
        public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

        public BigDecimal getDepositAmount() { return depositAmount; }
        public void setDepositAmount(BigDecimal depositAmount) { this.depositAmount = depositAmount; }
    }

    public static class CancelContractRequest {
        @NotBlank(message = "El motivo de anulación es obligatorio")
        @Size(min = 5, max = 500, message = "El motivo debe tener entre 5 y 500 caracteres")
        private String reason;

        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
    }
}
