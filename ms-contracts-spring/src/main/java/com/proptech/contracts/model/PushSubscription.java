package com.proptech.contracts.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

import java.time.LocalDateTime;

// CU06: suscripción Web Push de un dispositivo (celular o PC) de un usuario. Una persona puede tener varias.
@Entity
@Table(name = "push_subscriptions", indexes = @Index(name = "idx_push_user", columnList = "user_id"))
public class PushSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 40)
    private String userId;

    // URL del servicio de push del navegador (FCM, Mozilla, Apple): identifica al dispositivo.
    @Column(name = "endpoint", nullable = false, unique = true, length = 1000)
    private String endpoint;

    // Claves públicas del navegador para cifrar el mensaje: solo las usa el gateway.
    @JsonIgnore
    @Column(name = "p256dh", nullable = false, length = 200)
    private String p256dh;

    @JsonIgnore
    @Column(name = "auth_secret", nullable = false, length = 100)
    private String auth;

    @Column(name = "user_agent", length = 300)
    private String userAgent;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public PushSubscription() {}

    public Long getId() { return id; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getEndpoint() { return endpoint; }
    public void setEndpoint(String endpoint) { this.endpoint = endpoint; }
    public String getP256dh() { return p256dh; }
    public void setP256dh(String p256dh) { this.p256dh = p256dh; }
    public String getAuth() { return auth; }
    public void setAuth(String auth) { this.auth = auth; }
    public String getUserAgent() { return userAgent; }
    public void setUserAgent(String userAgent) { this.userAgent = userAgent; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
