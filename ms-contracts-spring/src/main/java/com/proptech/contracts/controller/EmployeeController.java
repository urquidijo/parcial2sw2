package com.proptech.contracts.controller;

import com.proptech.contracts.dto.EmployeeDtos.CreateEmployeeRequest;
import com.proptech.contracts.dto.EmployeeDtos.UpdateSectorRequest;
import com.proptech.contracts.model.User;
import com.proptech.contracts.service.EmployeeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

// CU08: gestión de empleados (solo ADMIN, ver SecurityConfig)
@RestController
@RequestMapping("/api/v1/employees")
@CrossOrigin(origins = "*")
public class EmployeeController {

    private final EmployeeService employeeService;

    public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @GetMapping
    public ResponseEntity<?> list() {
        List<User> employees = employeeService.listEmployees();
        return ResponseEntity.ok(Map.of("success", true, "count", employees.size(), "data", employees));
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody CreateEmployeeRequest req) {
        User employee = employeeService.create(req);
        return new ResponseEntity<>(Map.of(
                "success", true,
                "message", "Empleado creado. Al primer inicio de sesión deberá cambiar su contraseña temporal.",
                "data", employee
        ), HttpStatus.CREATED);
    }

    @PatchMapping("/{id}/sector")
    public ResponseEntity<?> updateSector(@PathVariable String id, @Valid @RequestBody UpdateSectorRequest req) {
        return ResponseEntity.ok(Map.of("success", true, "data", employeeService.updateSector(id, req.sector())));
    }

    @PostMapping("/{id}/deactivate")
    public ResponseEntity<?> deactivate(@PathVariable String id) {
        return ResponseEntity.ok(Map.of("success", true, "data", employeeService.setActive(id, false)));
    }

    @PatchMapping("/{id}/telegram-alerts")
    public ResponseEntity<?> telegramAlerts(@PathVariable String id, @RequestBody Map<String, Boolean> body) {
        boolean enabled = body != null && Boolean.TRUE.equals(body.get("enabled"));
        return ResponseEntity.ok(Map.of("success", true, "data", employeeService.setTelegramAlerts(id, enabled)));
    }

    @PostMapping("/{id}/activate")
    public ResponseEntity<?> activate(@PathVariable String id) {
        return ResponseEntity.ok(Map.of("success", true, "data", employeeService.setActive(id, true)));
    }
}
