package com.proptech.contracts.service;

import com.proptech.contracts.dto.EmployeeDtos.CreateEmployeeRequest;
import com.proptech.contracts.integration.KeycloakAdminClient;
import com.proptech.contracts.model.User;
import com.proptech.contracts.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

// CU08: alta, baja y cambio de sector. Keycloak es la fuente de verdad de la cuenta; PostgreSQL guarda el perfil.
@Service
public class EmployeeService {

    private static final Logger log = LoggerFactory.getLogger(EmployeeService.class);
    public static final List<String> SECTORS = List.of("AGENTE", "LEGAL", "FINANZAS", "ATENCION");

    private final UserRepository userRepository;
    private final KeycloakAdminClient keycloak;

    public EmployeeService(UserRepository userRepository, KeycloakAdminClient keycloak) {
        this.userRepository = userRepository;
        this.keycloak = keycloak;
    }

    @Transactional(readOnly = true)
    public List<User> listEmployees() {
        return userRepository.findByRoleOrderByNameAsc(User.ROLE_EMPLEADO);
    }

    @Transactional
    public User create(CreateEmployeeRequest req) {
        String sector = validSector(req.sector());
        String email = req.email().toLowerCase().trim();
        if (userRepository.existsByEmail(email)) {
            throw new IllegalStateException("Ya existe un usuario con el email " + email);
        }
        String firstName = req.firstName().trim();
        String lastName = req.lastName().trim();
        String keycloakId = keycloak.createEmployee(email, firstName, lastName, sector, req.temporaryPassword());

        String name = firstName + " " + lastName;
        User employee = new User(UserService.newUserId(), email, name, User.ROLE_EMPLEADO, sector, UserService.initialsOf(name));
        employee.setKeycloakId(keycloakId);
        log.info("Empleado {} creado en Keycloak y PostgreSQL (sector {})", email, sector);
        return userRepository.save(employee);
    }

    @Transactional
    public User updateSector(String id, String sector) {
        String validSector = validSector(sector);
        User employee = findEmployee(id);
        keycloak.updateSector(keycloakIdOf(employee), validSector);
        employee.setSector(validSector);
        return userRepository.save(employee);
    }

    @Transactional
    public User setActive(String id, boolean active) {
        User employee = findEmployee(id);
        keycloak.setEnabled(keycloakIdOf(employee), active);
        employee.setActive(active);
        log.info("Empleado {} {}", employee.getEmail(), active ? "reactivado" : "dado de baja");
        return userRepository.save(employee);
    }

    private User findEmployee(String id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Empleado no encontrado: " + id));
        if (!User.ROLE_EMPLEADO.equals(user.getRole())) {
            throw new IllegalArgumentException("El usuario " + user.getEmail() + " no es un empleado");
        }
        return user;
    }

    // Los perfiles creados antes del SSO aún no tienen keycloak_id: se busca la cuenta por email.
    private String keycloakIdOf(User user) {
        if (user.getKeycloakId() == null) {
            user.setKeycloakId(keycloak.findUserIdByEmail(user.getEmail()));
        }
        return user.getKeycloakId();
    }

    private static String validSector(String sector) {
        if (sector == null || !SECTORS.contains(sector.toUpperCase())) {
            throw new IllegalArgumentException("Sector inválido. Permitidos: " + SECTORS);
        }
        return sector.toUpperCase();
    }
}
