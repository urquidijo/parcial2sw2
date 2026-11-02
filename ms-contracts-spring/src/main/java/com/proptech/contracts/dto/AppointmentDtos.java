package com.proptech.contracts.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public final class AppointmentDtos {

    private AppointmentDtos() {}

    public record CreateAppointmentRequest(
            @NotBlank(message = "El inmueble es obligatorio") String propertyId,
            @Size(max = 200) String propertyTitle,
            @NotNull(message = "La fecha de la visita es obligatoria")
            @FutureOrPresent(message = "La fecha de la visita no puede estar en el pasado") LocalDate visitDate,
            @NotBlank(message = "La hora de la visita es obligatoria")
            @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$", message = "Hora inválida (formato HH:mm)") String visitTime,
            @Pattern(regexp = "PRESENCIAL|VIRTUAL_3D", message = "Tipo de visita inválido") String visitType,
            @Size(max = 500) String notes,
            @JsonAlias("userPhone") @Size(max = 30) String phone) {}

    public record UpdateAppointmentStatusRequest(
            @NotBlank(message = "El estado es obligatorio")
            @Pattern(regexp = "CONFIRMADA|COMPLETADA|CANCELADA", message = "Estado inválido") String status) {}
}
