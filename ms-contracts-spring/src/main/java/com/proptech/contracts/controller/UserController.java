package com.proptech.contracts.controller;

import com.proptech.contracts.model.User;
import com.proptech.contracts.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@CrossOrigin(origins = "*")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/auth/sso")
    public ResponseEntity<?> syncSsoUser(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(Map.of("success", true, "user", userService.syncFromToken(jwt)));
    }

    @GetMapping("/users")
    public ResponseEntity<?> getAllUsers() {
        List<User> users = userService.getAllUsers();
        return ResponseEntity.ok(Map.of("success", true, "count", users.size(), "data", users));
    }

    // Clientes para elegir al generar un contrato (Legal) o asignar una visita.
    @GetMapping("/clients")
    public ResponseEntity<?> getClients() {
        List<Map<String, String>> clients = userService.getClients().stream()
                .map(u -> Map.of("id", u.getId(), "name", u.getName(), "email", u.getEmail()))
                .toList();
        return ResponseEntity.ok(Map.of("success", true, "count", clients.size(), "data", clients));
    }
}
