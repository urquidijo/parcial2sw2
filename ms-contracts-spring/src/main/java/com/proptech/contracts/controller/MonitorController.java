package com.proptech.contracts.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.proptech.contracts.model.MonitorReport;
import com.proptech.contracts.repository.MonitorReportRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

// CU21: historial del agente monitor. Lo guarda el gateway (ADMIN) y lo lee la campanita (personal interno, ver SecurityConfig).
@RestController
@RequestMapping("/api/v1/monitor/reports")
@CrossOrigin(origins = "*")
public class MonitorController {

    private final MonitorReportRepository repository;

    public MonitorController(MonitorReportRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "10") int limit) {
        List<MonitorReport> reports = repository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, Math.max(1, Math.min(limit, 50))));
        return ResponseEntity.ok(Map.of("success", true, "count", reports.size(), "data", reports));
    }

    public record SaveReportRequest(String trigger, String summary, JsonNode alerts, String model,
                                    Integer inputTokens, Integer outputTokens, Integer notifiedChats) {}

    @PostMapping
    public ResponseEntity<?> save(@RequestBody SaveReportRequest req) {
        if (req.summary() == null || req.summary().isBlank() || req.alerts() == null || !req.alerts().isArray()) {
            throw new IllegalArgumentException("El reporte necesita un resumen y una lista de alertas");
        }
        MonitorReport report = new MonitorReport();
        report.setTrigger(MonitorReport.TRIGGER_SCHEDULED.equals(req.trigger()) ? MonitorReport.TRIGGER_SCHEDULED : MonitorReport.TRIGGER_MANUAL);
        report.setSummary(req.summary().length() > 2000 ? req.summary().substring(0, 2000) : req.summary());
        report.setAlerts(req.alerts().toString());
        report.setAlertCount(req.alerts().size());
        int high = 0;
        for (JsonNode alert : req.alerts()) {
            if ("alta".equalsIgnoreCase(alert.path("prioridad").asText())) high++;
        }
        report.setHighCount(high);
        report.setModel(req.model());
        report.setInputTokens(req.inputTokens());
        report.setOutputTokens(req.outputTokens());
        report.setNotifiedChats(req.notifiedChats());
        return new ResponseEntity<>(Map.of("success", true, "data", repository.save(report)), HttpStatus.CREATED);
    }
}
