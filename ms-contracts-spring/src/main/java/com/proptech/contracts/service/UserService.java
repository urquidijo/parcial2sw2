package com.proptech.contracts.service;

import com.proptech.contracts.model.User;
import com.proptech.contracts.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    public Map<String, Object> login(String email, String password) {
        Optional<User> userOpt = findByEmail(email);
        if (userOpt.isEmpty()) {
            throw new IllegalArgumentException("Usuario o correo no encontrado en PostgreSQL.");
        }
        User user = userOpt.get();
        // Generar token JWT simulado en base64
        String tokenPayload = "{\"id\":\"" + user.getId() + "\",\"email\":\"" + user.getEmail() + "\",\"role\":\"" + user.getRole() + "\"}";
        String token = "jwt-token-" + Base64.getEncoder().encodeToString(tokenPayload.getBytes());

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("message", "Inicio de sesión verificado con éxito en PostgreSQL");
        res.put("user", user);
        res.put("token", token);
        return res;
    }

    @Transactional
    public Map<String, Object> register(String email, String password, String name) {
        String cleanEmail = email.toLowerCase().trim();
        if (userRepository.existsByEmail(cleanEmail)) {
            throw new IllegalStateException("Ya existe una cuenta con este correo electrónico.");
        }

        String id = "USR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        String initials = Arrays.stream(name.trim().split(" "))
                .filter(s -> !s.isEmpty())
                .map(s -> s.substring(0, 1))
                .reduce("", (a, b) -> a + b);
        if (initials.length() > 2) initials = initials.substring(0, 2).toUpperCase();

        User user = new User(id, cleanEmail, password != null ? password : "pass123", name.trim(), "CLIENTE", initials);
        User saved = userRepository.save(user);

        String tokenPayload = "{\"id\":\"" + saved.getId() + "\",\"email\":\"" + saved.getEmail() + "\",\"role\":\"" + saved.getRole() + "\"}";
        String token = "jwt-token-" + Base64.getEncoder().encodeToString(tokenPayload.getBytes());

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("message", "Cuenta de Comprador creada exitosamente en PostgreSQL");
        res.put("user", saved);
        res.put("token", token);
        return res;
    }

    @Transactional
    public User updateRole(String id, String newRole) {
        List<String> validRoles = List.of("CLIENTE", "AGENTE", "LEGAL", "ADMIN");
        if (!validRoles.contains(newRole)) {
            throw new IllegalArgumentException("Rol inválido. Permitidos: " + validRoles);
        }
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado: " + id));
        user.setRole(newRole);
        return userRepository.save(user);
    }

    @PostConstruct
    public void seedInitialUsers() {
        if (userRepository.count() == 0) {
            log.info("Sembrando usuarios iniciales en PostgreSQL Render...");
            List<User> defaults = List.of(
                    new User("CLI-JUAN-COMPRADOR", "juan.comprador@habitat.pro", "pass123", "Juan Comprador", "CLIENTE", "JC"),
                    new User("AGT-CARLOS-BROKER", "carlos.broker@habitat.pro", "pass123", "Carlos Broker", "AGENTE", "CB"),
                    new User("NOT-ELENA-RAMOS", "elena.ramos@habitat.pro", "pass123", "Dra. Elena Ramos", "LEGAL", "ER"),
                    new User("ADM-SISTEMAS", "admin@habitat.pro", "pass123", "Administrador Principal", "ADMIN", "AD")
            );
            userRepository.saveAll(defaults);
            log.info("✅ 4 usuarios base sembrados exitosamente en PostgreSQL Render.");
        }
    }
}
