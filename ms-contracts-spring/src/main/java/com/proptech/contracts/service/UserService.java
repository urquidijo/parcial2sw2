package com.proptech.contracts.service;

import com.proptech.contracts.model.User;
import com.proptech.contracts.repository.UserRepository;
import com.proptech.contracts.security.KeycloakClaims;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<User> findById(String id) {
        return userRepository.findById(id);
    }

    @Transactional(readOnly = true)
    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email.toLowerCase().trim());
    }

    @Transactional
    public User currentUser(Jwt jwt) {
        return userRepository.findByKeycloakId(jwt.getSubject()).orElseGet(() -> syncFromToken(jwt));
    }

    @Transactional(readOnly = true)
    public List<User> getClients() {
        return userRepository.findByRoleOrderByNameAsc(User.ROLE_CLIENTE);
    }

    @Transactional
    public User syncFromToken(Jwt jwt) {
        String email = Optional.ofNullable(jwt.getClaimAsString("email"))
                .map(e -> e.toLowerCase().trim())
                .filter(e -> !e.isEmpty())
                .orElseThrow(() -> new IllegalArgumentException("El token de Keycloak no incluye el email del usuario."));
        String role = KeycloakClaims.primaryRole(jwt);
        String sector = User.ROLE_EMPLEADO.equals(role) ? jwt.getClaimAsString("sector") : null;
        String tokenName = Optional.ofNullable(jwt.getClaimAsString("name")).filter(n -> !n.isBlank()).orElse(email);

        User user = userRepository.findByKeycloakId(jwt.getSubject())
                .or(() -> userRepository.findByEmail(email))
                .orElseGet(() -> {
                    log.info("Nuevo usuario SSO registrado en PostgreSQL: {}", email);
                    return new User(newUserId(), email, tokenName, role, sector, initialsOf(tokenName));
                });

        user.setKeycloakId(jwt.getSubject());
        user.setEmail(email);
        user.setRole(role);
        user.setSector(sector);
        return userRepository.save(user);
    }

    // Telegram (CU21): el gateway confirma el chat con el código de /start y aquí se guarda en el perfil del usuario.
    @Transactional
    public User linkTelegram(Jwt jwt, String chatId) {
        if (chatId == null || !chatId.matches("-?\\d{1,20}")) {
            throw new IllegalArgumentException("Chat de Telegram inválido");
        }
        User user = currentUser(jwt);
        // Un chat pertenece a una sola cuenta: si estaba vinculado a otra, se desvincula de ella.
        userRepository.findByTelegramChatId(chatId)
                .filter(other -> !other.getId().equals(user.getId()))
                .ifPresent(other -> {
                    other.setTelegramChatId(null);
                    other.setTelegramAlerts(false);
                    userRepository.save(other);
                });
        user.setTelegramChatId(chatId);
        if (User.ROLE_ADMIN.equals(user.getRole())) {
            user.setTelegramAlerts(true); // el Administrador recibe las alertas al vincularse
        }
        return userRepository.save(user);
    }

    @Transactional
    public User unlinkTelegram(Jwt jwt) {
        User user = currentUser(jwt);
        user.setTelegramChatId(null);
        user.setTelegramAlerts(false);
        return userRepository.save(user);
    }

    // Destinatarios de las alertas del agente monitor: vinculados y con alertas activas.
    @Transactional(readOnly = true)
    public List<Map<String, String>> telegramRecipients() {
        return userRepository.findByTelegramAlertsTrueAndTelegramChatIdIsNotNull().stream()
                .filter(User::isActive)
                .map(u -> Map.of("id", u.getId(), "name", u.getName(), "chatId", u.getTelegramChatId()))
                .toList();
    }

    @Transactional
    public void seedInitialUsers() {
        if (userRepository.count() > 0) return;
        log.info("Sembrando usuarios iniciales en PostgreSQL...");
        userRepository.saveAll(List.of(
                new User("CLI-JUAN-COMPRADOR", "juan.comprador@habitat.pro", "Juan Comprador", User.ROLE_CLIENTE, null, "JC"),
                new User("AGT-CARLOS-BROKER", "carlos.broker@habitat.pro", "Carlos Broker", User.ROLE_EMPLEADO, "AGENTE", "CB"),
                new User("NOT-ELENA-RAMOS", "elena.ramos@habitat.pro", "Dra. Elena Ramos", User.ROLE_EMPLEADO, "LEGAL", "ER"),
                new User("FIN-MARIA-FINANZAS", "maria.finanzas@habitat.pro", "María Finanzas", User.ROLE_EMPLEADO, "FINANZAS", "MF"),
                new User("ADM-SISTEMAS", "admin@habitat.pro", "Administrador Principal", User.ROLE_ADMIN, null, "AD")
        ));
    }

    static String newUserId() {
        return "USR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    static String initialsOf(String name) {
        String initials = Arrays.stream(name.trim().split("\\s+"))
                .filter(s -> !s.isEmpty())
                .map(s -> s.substring(0, 1))
                .reduce("", String::concat)
                .toUpperCase();
        return initials.length() > 2 ? initials.substring(0, 2) : initials;
    }
}
