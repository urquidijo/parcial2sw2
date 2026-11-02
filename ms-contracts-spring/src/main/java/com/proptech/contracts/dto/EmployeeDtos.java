package com.proptech.contracts.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class EmployeeDtos {

    private EmployeeDtos() {}

    public record CreateEmployeeRequest(
            @NotBlank(message = "El nombre es obligatorio") @Size(max = 50) String firstName,
            @NotBlank(message = "El apellido es obligatorio") @Size(max = 50) String lastName,
            @NotBlank(message = "El email es obligatorio") @Email(message = "El email no es válido") String email,
            @NotBlank(message = "El sector es obligatorio") String sector,
            @NotBlank(message = "La contraseña temporal es obligatoria")
            @Size(min = 8, message = "La contraseña temporal debe tener al menos 8 caracteres") String temporaryPassword) {}

    public record UpdateSectorRequest(@NotBlank(message = "El sector es obligatorio") String sector) {}
}
