package com.proptech.contracts.service;

import com.proptech.contracts.model.Appointment;
import com.proptech.contracts.repository.AppointmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class AppointmentService {

    private final AppointmentRepository appointmentRepository;

    public AppointmentService(AppointmentRepository appointmentRepository) {
        this.appointmentRepository = appointmentRepository;
    }

    @Transactional(readOnly = true)
    public List<Appointment> getAppointments(String userId, String role) {
        if ("CLIENTE".equalsIgnoreCase(role) && userId != null && !userId.isBlank()) {
            return appointmentRepository.findByUserIdOrderByVisitDateDescVisitTimeAsc(userId);
        }
        return appointmentRepository.findAllByOrderByVisitDateDescVisitTimeAsc();
    }

    @Transactional
    public Appointment scheduleAppointment(Appointment appointment) {
        if (appointment.getId() == null || appointment.getId().isBlank()) {
            appointment.setId("VIS-" + (1000 + (int)(Math.random() * 9000)));
        }
        if (appointment.getVisitDate() == null) {
            appointment.setVisitDate(LocalDate.now().plusDays(2));
        }
        if (appointment.getStatus() == null) {
            appointment.setStatus("CONFIRMADA");
        }
        return appointmentRepository.save(appointment);
    }

    @Transactional
    public Appointment updateStatus(String id, String status) {
        Appointment app = appointmentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Cita no encontrada: " + id));
        app.setStatus(status);
        return appointmentRepository.save(app);
    }
}
