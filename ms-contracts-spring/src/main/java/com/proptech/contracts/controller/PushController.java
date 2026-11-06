package com.proptech.contracts.controller;

import com.proptech.contracts.model.PushSubscription;
import com.proptech.contracts.model.User;
import com.proptech.contracts.repository.PushSubscriptionRepository;
import com.proptech.contracts.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * CU06: suscripciones Web Push.
 *  - PUT/DELETE /users/me/push : el usuario registra o quita SU dispositivo (el dueño sale del token).
 *  - GET /push/subscriptions?userId= : el gateway (cuenta de servicio ADMIN) obtiene a dónde enviar un aviso.
 *  - DELETE /push/subscriptions?endpoint= : el gateway borra un dispositivo que ya no existe (404/410 del servicio de push).
 */
@RestController
@RequestMapping("/api/v1")
@CrossOrigin(origins = "*")
public class PushController {

    private final PushSubscriptionRepository repository;
    private final UserService userService;

    public PushController(PushSubscriptionRepository repository, UserService userService) {
        this.repository = repository;
        this.userService = userService;
    }

    @PutMapping("/users/me/push")
    @Transactional
    public ResponseEntity<?> subscribe(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> body) {
        String endpoint = str(body.get("endpoint"));
        Map<?, ?> keys = body.get("keys") instanceof Map<?, ?> k ? k : Map.of();
        String p256dh = str(keys.get("p256dh"));
        String auth = str(keys.get("auth"));
        if (!endpoint.startsWith("https://") || endpoint.length() > 1000 || p256dh.isEmpty() || p256dh.length() > 200 || auth.isEmpty() || auth.length() > 100) {
            throw new IllegalArgumentException("Suscripción de notificaciones inválida");
        }
        User user = userService.currentUser(jwt);
        // El mismo dispositivo queda con quien inició sesión por última vez en él.
        PushSubscription sub = repository.findByEndpoint(endpoint).orElseGet(PushSubscription::new);
        sub.setUserId(user.getId());
        sub.setEndpoint(endpoint);
        sub.setP256dh(p256dh);
        sub.setAuth(auth);
        String ua = str(body.get("userAgent"));
        sub.setUserAgent(ua.length() > 300 ? ua.substring(0, 300) : ua);
        repository.save(sub);
        return ResponseEntity.ok(Map.of("success", true, "devices", repository.countByUserId(user.getId())));
    }

    @DeleteMapping("/users/me/push")
    public ResponseEntity<?> unsubscribe(@AuthenticationPrincipal Jwt jwt, @RequestParam String endpoint) {
        User user = userService.currentUser(jwt);
        long removed = repository.deleteByEndpointAndUserId(endpoint, user.getId());
        return ResponseEntity.ok(Map.of("success", true, "removed", removed, "devices", repository.countByUserId(user.getId())));
    }

    @GetMapping("/push/subscriptions")
    public ResponseEntity<?> forUser(@RequestParam String userId) {
        List<Map<String, String>> subs = repository.findByUserId(userId).stream()
                .map(s -> Map.of("endpoint", s.getEndpoint(), "p256dh", s.getP256dh(), "auth", s.getAuth()))
                .toList();
        return ResponseEntity.ok(Map.of("success", true, "count", subs.size(), "data", subs));
    }

    @DeleteMapping("/push/subscriptions")
    public ResponseEntity<?> removeExpired(@RequestParam String endpoint) {
        return ResponseEntity.ok(Map.of("success", true, "removed", repository.deleteByEndpoint(endpoint)));
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }
}
