package com.proptech.contracts.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;

// Las credenciales viven en Keycloak; este perfil se sincroniza desde el token en cada login.
@Entity
@Table(name = "users")
public class User {

    public static final String ROLE_CLIENTE = "CLIENTE";
    public static final String ROLE_EMPLEADO = "EMPLEADO";
    public static final String ROLE_ADMIN = "ADMIN";

    @Id
    @Column(name = "id", length = 50)
    private String id;

    @Column(name = "keycloak_id", unique = true, length = 64)
    private String keycloakId;

    @Column(name = "email", unique = true, nullable = false, length = 100)
    private String email;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "role", nullable = false, length = 50)
    private String role; // CLIENTE, EMPLEADO, ADMIN

    @Column(name = "sector", length = 20)
    private String sector; // AGENTE, LEGAL, FINANZAS, ATENCION (solo EMPLEADO)

    @Column(name = "initials", length = 10)
    private String initials;

    @Column(name = "phone", length = 50)
    private String phone;

    @Column(name = "active")
    private Boolean active = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    // Telegram (CU21): chat al que el bot puede escribirle (el usuario lo vincula con /start) y si recibe las alertas del monitor.
    // El chat id no se publica en el JSON: solo si está vinculado.
    @JsonIgnore
    @Column(name = "telegram_chat_id", length = 40)
    private String telegramChatId;

    @Column(name = "telegram_alerts")
    private Boolean telegramAlerts;

    public User() {
        this.createdAt = LocalDateTime.now();
    }

    public User(String id, String email, String name, String role, String sector, String initials) {
        this.id = id;
        this.email = email;
        this.name = name;
        this.role = role;
        this.sector = sector;
        this.initials = initials;
        this.createdAt = LocalDateTime.now();
    }

    @PrePersist
    protected void onCreate() {
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now();
        }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getKeycloakId() { return keycloakId; }
    public void setKeycloakId(String keycloakId) { this.keycloakId = keycloakId; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getSector() { return sector; }
    public void setSector(String sector) { this.sector = sector; }

    public String getInitials() { return initials; }
    public void setInitials(String initials) { this.initials = initials; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public boolean isActive() { return active == null || active; }
    public void setActive(boolean active) { this.active = active; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    @JsonIgnore
    public String getTelegramChatId() { return telegramChatId; }
    public void setTelegramChatId(String telegramChatId) { this.telegramChatId = telegramChatId; }

    public boolean isTelegramLinked() { return telegramChatId != null && !telegramChatId.isBlank(); }

    public boolean isTelegramAlerts() { return Boolean.TRUE.equals(telegramAlerts); }
    public void setTelegramAlerts(boolean telegramAlerts) { this.telegramAlerts = telegramAlerts; }
}
