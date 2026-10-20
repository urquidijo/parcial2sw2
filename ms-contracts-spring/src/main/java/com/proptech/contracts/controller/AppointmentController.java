package com.proptech.contracts.controller;

import com.proptech.contracts.model.Appointment;
import com.proptech.contracts.service.AppointmentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/appointments")
@CrossOrigin(origins = "*")
public class AppointmentController {

    private final AppointmentService appointmentService;

    public AppointmentController(AppointmentService appointmentService) {
        this.appointmentService = appointmentService;
    }

    @GetMapping
    public ResponseEntity<?> getAppointments(
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String role) {
        List<Appointment> list = appointmentService.getAppointments(userId, role);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "count", list.size(),
                "data", list
        ));
    }

    @PostMapping
    public ResponseEntity<?> createAppointment(@RequestBody Map<String, Object> body) {
        try {
            Appointment app = new Appointment();
            app.setPropertyId((String) body.get("propertyId"));
            app.setPropertyTitle((String) body.getOrDefault("propertyTitle", "Inmueble Seleccionado"));
            app.setUserId((String) body.get("userId"));
            app.setUserName((String) body.getOrDefault("userName", "Cliente"));
            app.setUserPhone((String) body.getOrDefault("userPhone", ""));
            
            if (body.get("visitDate") != null) {
                app.setVisitDate(LocalDate.parse(body.get("visitDate").toString()));
            }
            app.setVisitTime((String) body.getOrDefault("visitTime", "10:00"));
            app.setVisitType((String) body.getOrDefault("visitType", "PRESENCIAL"));
            app.setNotes((String) body.getOrDefault("notes", ""));

            Appointment saved = appointmentService.scheduleAppointment(app);
            return new ResponseEntity<>(Map.of(
                    "success", true,
                    "message", "Visita agendada exitosamente en PostgreSQL",
                    "id", saved.getId(),
                    "data", saved
            ), HttpStatus.CREATED);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "success", false,
                    "message", e.getMessage()
            ));
        }
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable String id, @RequestBody Map<String, String> body) {
        try {
            String status = body.get("status");
            Appointment updated = appointmentService.updateStatus(id, status);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Estado de la cita actualizado a " + status + " en PostgreSQL",
                    "data", updated
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "success", false,
                    "message", e.getMessage()
            ));
        }
    }
}
