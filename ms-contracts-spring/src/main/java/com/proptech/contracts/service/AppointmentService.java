package com.proptech.contracts.service;

import com.proptech.contracts.dto.AppointmentDtos.CreateAppointmentRequest;
import com.proptech.contracts.model.Appointment;
import com.proptech.contracts.model.User;
import com.proptech.contracts.repository.AppointmentRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

@Service
public class AppointmentService {

    private static final String CONFIRMADA = "CONFIRMADA";
    private static final String CANCELADA = "CANCELADA";
    private static final Set<String> FINAL_STATUSES = Set.of("COMPLETADA", CANCELADA);
    private static final Set<String> AGENDA_MANAGERS = Set.of("AGENTE", "ADMIN");
    private static final LocalTime OPENING = LocalTime.of(8, 0);
    private static final LocalTime CLOSING = LocalTime.of(19, 0);

    private final AppointmentRepository appointmentRepository;

    public AppointmentService(AppointmentRepository appointmentRepository) {
        this.appointmentRepository = appointmentRepository;
    }

    // El cliente ve solo sus visitas; el personal ve la agenda completa.
    @Transactional(readOnly = true)
    public List<Appointment> getAppointments(User user, String role) {
        if (User.ROLE_CLIENTE.equals(role)) {
            return appointmentRepository.findByUserIdOrderByVisitDateDescVisitTimeAsc(user.getId());
        }
        return appointmentRepository.findAllByOrderByVisitDateDescVisitTimeAsc();
    }

    @Transactional
    public Appointment scheduleAppointment(CreateAppointmentRequest req, User client) {
        LocalTime time = LocalTime.parse(req.visitTime());
        if (time.isBefore(OPENING) || time.isAfter(CLOSING)) {
            throw new IllegalArgumentException("Las visitas se agendan entre las 08:00 y las 19:00");
        }
        if (appointmentRepository.existsByPropertyIdAndVisitDateAndVisitTimeAndStatus(req.propertyId(), req.visitDate(), req.visitTime(), CONFIRMADA)) {
            throw new IllegalStateException("Ese horario ya está reservado para este inmueble. Elige otra hora.");
        }

        Appointment appointment = new Appointment();
        appointment.setId("VIS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        appointment.setPropertyId(req.propertyId());
        appointment.setPropertyTitle(req.propertyTitle() != null && !req.propertyTitle().isBlank() ? req.propertyTitle() : "Inmueble " + req.propertyId());
        appointment.setUserId(client.getId());
        appointment.setUserName(client.getName());
        appointment.setUserPhone(req.phone() != null ? req.phone() : client.getPhone());
        appointment.setVisitDate(req.visitDate());
        appointment.setVisitTime(req.visitTime());
        appointment.setVisitType(req.visitType() != null ? req.visitType() : "PRESENCIAL");
        appointment.setNotes(req.notes() != null ? req.notes() : "");
        appointment.setStatus(CONFIRMADA);
        return appointmentRepository.save(appointment);
    }

    @Transactional
    public Appointment updateStatus(String id, String status, User user, String role) {
        Appointment appointment = appointmentRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Visita no encontrada: " + id));

        if (User.ROLE_CLIENTE.equals(role)) {
            if (!appointment.getUserId().equals(user.getId()) || !CANCELADA.equals(status)) {
                throw new AccessDeniedException("El cliente solo puede cancelar sus propias visitas");
            }
        } else if (!AGENDA_MANAGERS.contains(role)) {
            throw new AccessDeniedException("Solo el agente o el administrador gestionan la agenda de visitas");
        }
        if (FINAL_STATUSES.contains(appointment.getStatus())) {
            throw new IllegalStateException("La visita ya está " + appointment.getStatus() + " y no se puede modificar");
        }

        appointment.setStatus(status);
        return appointmentRepository.save(appointment);
    }
}
