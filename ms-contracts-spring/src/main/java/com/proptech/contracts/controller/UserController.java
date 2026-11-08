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

    // Telegram (CU21): el gateway confirma el chat con el código de /start y lo guarda en el perfil de quien llama.
    @PutMapping("/users/me/telegram")
    public ResponseEntity<?> linkTelegram(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(Map.of("success", true, "user", userService.linkTelegram(jwt, body == null ? null : body.get("chatId"))));
    }

    @DeleteMapping("/users/me/telegram")
    public ResponseEntity<?> unlinkTelegram(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(Map.of("success", true, "user", userService.unlinkTelegram(jwt)));
    }

    // Destinatarios de las alertas del agente monitor (solo ADMIN, ver SecurityConfig).
    @GetMapping("/telegram/recipients")
    public ResponseEntity<?> telegramRecipients() {
        List<Map<String, String>> recipients = userService.telegramRecipients();
        return ResponseEntity.ok(Map.of("success", true, "count", recipients.size(), "data", recipients));
    }

    // CU14: chat de Telegram de un usuario para avisarle de su reserva (solo ADMIN, ver SecurityConfig).
    @GetMapping("/telegram/chat")
    public ResponseEntity<?> telegramChat(@RequestParam String userId) {
        String chatId = userService.telegramChatOf(userId).orElse(null);
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("success", true);
        body.put("linked", chatId != null);
        body.put("chatId", chatId);
        return ResponseEntity.ok(body);
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
