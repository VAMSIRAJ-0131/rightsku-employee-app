package com.rightsku.employee_app;

import java.util.Collection;
import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    /** BCrypt cost factor. 12 is a common production choice (~0.25 s per hash). */
    static final int BCRYPT_STRENGTH = 12;

    /**
     * The only permission of a token issued while the account still has a
     * temporary password. It carries no role, so every /api/hr/** and
     * /api/employee/** endpoint answers 403 until the password is changed.
     */
    static final String PASSWORD_CHANGE_ONLY = "PASSWORD_CHANGE_ONLY";

    static final String CHANGE_PASSWORD_PATH = "/api/auth/change-password";

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(BCRYPT_STRENGTH);
    }

    @Bean
    public AuthenticationProvider authenticationProvider(
            AppUserDetailsService appUserDetailsService,
            PasswordEncoder passwordEncoder) {

        DaoAuthenticationProvider provider =
                new DaoAuthenticationProvider(appUserDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationProvider authenticationProvider) {
        return new ProviderManager(authenticationProvider);
    }

    @Bean
    public JwtDecoder jwtDecoder(
            JwtService jwtService,
            AppUserRepository appUserRepository) {
        // Signature, expiry and issuer checks, plus: the user must still
        // exist, be active, and have the same role as in the token.
        return jwtService.jwtDecoderFromConfiguredSecret(
                new ActiveUserJwtValidator(appUserRepository));
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter roleConverter =
                new JwtGrantedAuthoritiesConverter();

        roleConverter.setAuthoritiesClaimName("role");
        roleConverter.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> authoritiesFor(jwt, roleConverter));
        return converter;
    }

    /** ROLE_EMPLOYEE / ROLE_HR_ADMIN, or only PASSWORD_CHANGE_ONLY for a temporary-password token. */
    static Collection<GrantedAuthority> authoritiesFor(
            Jwt jwt, JwtGrantedAuthoritiesConverter roleConverter) {
        if (ActiveUserJwtValidator.passwordChangeRequired(jwt)) {
            return List.of(new SimpleGrantedAuthority(PASSWORD_CHANGE_ONLY));
        }
        return roleConverter.convert(jwt);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            AuthenticationProvider authenticationProvider,
            JwtAuthenticationConverter jwtAuthenticationConverter)
            throws Exception {

        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authenticationProvider(authenticationProvider)
            .authorizeHttpRequests(auth -> auth
                // Changing the password needs a valid token of any kind,
                // including a temporary-password token. Listed before the
                // public /api/auth/** rule because the first match wins.
                .requestMatchers(HttpMethod.POST, CHANGE_PASSWORD_PATH).authenticated()
                .requestMatchers("/api/auth/**").permitAll()
                // Lets Spring Boot's error responses (e.g. 400) reach the
                // client instead of being replaced by a 401.
                .requestMatchers("/error").permitAll()
                .requestMatchers("/api/hr/**").hasRole("HR_ADMIN")
                .requestMatchers("/api/employee/**").hasRole("EMPLOYEE")
                // Anything else needs a full account role, so a temporary-password
                // token can never reach a future endpoint outside these paths.
                .anyRequest().hasAnyRole("EMPLOYEE", "HR_ADMIN")
            )
            .oauth2ResourceServer(oauth2 ->
                oauth2.jwt(jwt ->
                    jwt.jwtAuthenticationConverter(jwtAuthenticationConverter)));

        return http.build();
    }
}