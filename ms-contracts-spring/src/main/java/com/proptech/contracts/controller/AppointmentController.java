package com.proptech.contracts.controller;

import com.proptech.contracts.dto.AppointmentDtos.CreateAppointmentRequest;
import com.proptech.contracts.dto.AppointmentDtos.UpdateAppointmentStatusRequest;
import com.proptech.contracts.model.Appointment;
import com.proptech.contracts.security.KeycloakClaims;
import com.proptech.contracts.service.AppointmentService;
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
@RequestMapping("/api/v1/appointments")
@CrossOrigin(origins = "*")
public class AppointmentController {

    private final AppointmentService appointmentService;
    private final UserService userService;

    public AppointmentController(AppointmentService appointmentService, UserService userService) {
        this.appointmentService = appointmentService;
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<?> getAppointments(@AuthenticationPrincipal Jwt jwt) {
        List<Appointment> list = appointmentService.getAppointments(userService.currentUser(jwt), KeycloakClaims.effectiveRole(jwt));
        return ResponseEntity.ok(Map.of("success", true, "count", list.size(), "data", list));
    }

    @PostMapping
    public ResponseEntity<?> createAppointment(@Valid @RequestBody CreateAppointmentRequest req, @AuthenticationPrincipal Jwt jwt) {
        Appointment saved = appointmentService.scheduleAppointment(req, userService.currentUser(jwt));
        return new ResponseEntity<>(Map.of(
                "success", true,
                "message", "Visita agendada para el " + saved.getVisitDate() + " a las " + saved.getVisitTime(),
                "id", saved.getId(),
                "data", saved
        ), HttpStatus.CREATED);
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable String id, @Valid @RequestBody UpdateAppointmentStatusRequest req, @AuthenticationPrincipal Jwt jwt) {
        Appointment updated = appointmentService.updateStatus(id, req.status(), userService.currentUser(jwt), KeycloakClaims.effectiveRole(jwt));
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Visita " + id + " marcada como " + updated.getStatus(),
                "data", updated
        ));
    }
}
