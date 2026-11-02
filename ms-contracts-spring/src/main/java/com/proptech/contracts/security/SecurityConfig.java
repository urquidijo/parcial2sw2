package com.proptech.contracts.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

import java.util.ArrayList;
import java.util.List;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // Usuarios y empleados (CU07, CU08)
                        .requestMatchers("/api/v1/auth/sso").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/clients").hasAnyRole("ADMIN", "LEGAL", "AGENTE")
                        // El Cajero lee la lista de empleados para asignar la comisión al agente (CU16/CU17)
                        .requestMatchers(HttpMethod.GET, "/api/v1/employees").hasAnyRole("ADMIN", "FINANZAS")
                        .requestMatchers("/api/v1/users/**", "/api/v1/employees/**").hasRole("ADMIN")
                        // Visitas (CU09, CU10): el estado lo valida el servicio según el rol
                        .requestMatchers(HttpMethod.POST, "/api/v1/appointments").hasRole("CLIENTE")
                        .requestMatchers("/api/v1/appointments/**").authenticated()
                        // Contratos (CU11, CU12)
                        .requestMatchers(HttpMethod.POST, "/api/v1/contracts").hasAnyRole("LEGAL", "ADMIN")
                        // CU15: al cancelar la reserva se anula su pre-contrato de arras (el titular lo valida el servicio)
                        .requestMatchers(HttpMethod.POST, "/api/v1/contracts/reservations/*/cancel").hasAnyRole("CLIENTE", "FINANZAS", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/contracts/*/cancel").hasAnyRole("LEGAL", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/contracts/*/signatures").hasAnyRole("CLIENTE", "LEGAL")
                        .requestMatchers("/api/v1/contracts/**").authenticated()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(keycloakRolesConverter())));
        return http.build();
    }

    // Una sola autoridad por rol efectivo: ROLE_ADMIN, ROLE_CLIENTE o ROLE_<sector> (+ ROLE_EMPLEADO).
    private JwtAuthenticationConverter keycloakRolesConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            List<GrantedAuthority> authorities = new ArrayList<>();
            authorities.add(new SimpleGrantedAuthority("ROLE_" + KeycloakClaims.effectiveRole(jwt)));
            if ("EMPLEADO".equals(KeycloakClaims.primaryRole(jwt))) {
                authorities.add(new SimpleGrantedAuthority("ROLE_EMPLEADO"));
            }
            return authorities;
        });
        return converter;
    }
}
