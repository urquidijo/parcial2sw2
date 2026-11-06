package com.proptech.contracts.model;

import com.fasterxml.jackson.annotation.JsonRawValue;
import jakarta.persistence.*;

import java.time.LocalDateTime;

// CU21: cada revisión del agente monitor del negocio (la muestra la campanita del encabezado).
@Entity
@Table(name = "monitor_reports")
public class MonitorReport {

    public static final String TRIGGER_MANUAL = "MANUAL";
    public static final String TRIGGER_SCHEDULED = "PROGRAMADO";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "trigger_type", nullable = false, length = 20)
    private String trigger;

    @Column(name = "summary", nullable = false, length = 2000)
    private String summary;

    // Lista de alertas en JSON: [{ prioridad, titulo, detalle, accion }]
    @JsonRawValue
    @Column(name = "alerts_json", nullable = false, columnDefinition = "TEXT")
    private String alerts;

    @Column(name = "alert_count", nullable = false)
    private int alertCount;

    @Column(name = "high_count", nullable = false)
    private int highCount;

    @Column(name = "model", length = 60)
    private String model;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(name = "notified_chats")
    private Integer notifiedChats;

    public Long getId() { return id; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public String getTrigger() { return trigger; }
    public void setTrigger(String trigger) { this.trigger = trigger; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public String getAlerts() { return alerts; }
    public void setAlerts(String alerts) { this.alerts = alerts; }
    public int getAlertCount() { return alertCount; }
    public void setAlertCount(int alertCount) { this.alertCount = alertCount; }
    public int getHighCount() { return highCount; }
    public void setHighCount(int highCount) { this.highCount = highCount; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public Integer getInputTokens() { return inputTokens; }
    public void setInputTokens(Integer inputTokens) { this.inputTokens = inputTokens; }
    public Integer getOutputTokens() { return outputTokens; }
    public void setOutputTokens(Integer outputTokens) { this.outputTokens = outputTokens; }
    public Integer getNotifiedChats() { return notifiedChats; }
    public void setNotifiedChats(Integer notifiedChats) { this.notifiedChats = notifiedChats; }
}
