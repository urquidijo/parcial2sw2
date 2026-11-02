package com.proptech.contracts.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

// Firma digital simulada: el hash SHA-256 sella el contenido del contrato al momento de firmar.
@Entity
@Table(name = "contract_signatures")
public class ContractSignature {

    public static final String ROLE_CLIENTE = "CLIENTE";
    public static final String ROLE_LEGAL = "LEGAL";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "signer_user_id", nullable = false, length = 50)
    private String signerUserId;

    @Column(name = "signer_name", nullable = false, length = 100)
    private String signerName;

    @Column(name = "signer_role", nullable = false, length = 20)
    private String signerRole;

    @Column(name = "document_hash", nullable = false, length = 64)
    private String documentHash;

    @Column(name = "signed_at", nullable = false)
    private LocalDateTime signedAt;

    public ContractSignature() {}

    public ContractSignature(String signerUserId, String signerName, String signerRole, String documentHash, LocalDateTime signedAt) {
        this.signerUserId = signerUserId;
        this.signerName = signerName;
        this.signerRole = signerRole;
        this.documentHash = documentHash;
        this.signedAt = signedAt;
    }

    public Long getId() { return id; }
    public String getSignerUserId() { return signerUserId; }
    public String getSignerName() { return signerName; }
    public String getSignerRole() { return signerRole; }
    public String getDocumentHash() { return documentHash; }
    public LocalDateTime getSignedAt() { return signedAt; }
}
