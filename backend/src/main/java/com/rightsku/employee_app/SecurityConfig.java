
package com.rightsku.employee_app;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
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
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

    static final int BCRYPT_STRENGTH = 12;

    static final String PASSWORD_CHANGE_ONLY = "PASSWORD_CHANGE_ONLY";
    static final String CHANGE_PASSWORD_PATH = "/api/auth/change-password";
    static final String REMEMBER_DEVICE_PATH = "/api/auth/remember-device";

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
        converter.setJwtGrantedAuthoritiesConverter(
                jwt -> authoritiesFor(jwt, roleConverter));
        return converter;
    }

    static Collection<GrantedAuthority> authoritiesFor(
            Jwt jwt, JwtGrantedAuthoritiesConverter roleConverter) {
        if (ActiveUserJwtValidator.passwordChangeRequired(jwt)) {
            return List.of(new SimpleGrantedAuthority(PASSWORD_CHANGE_ONLY));
        }
        return roleConverter.convert(jwt);
    }

    /**
     * Allowed origins come from app.cors.allowed-origins (comma-separated).
     * The Android app always calls from https://localhost; production sets
     * only the app's origins, leaving out the local web dev addresses.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") String allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();

        config.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList());

        config.setAllowedMethods(List.of(
                "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"
        ));

        config.setAllowedHeaders(List.of("*"));
        // The Android app runs on another origin, so the WebView only lets it read
        // these response headers when they are listed: the document file name
        // for downloads, and the wait time after too many sign-in attempts.
        config.setExposedHeaders(List.of("Content-Disposition", "Retry-After"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            AuthenticationProvider authenticationProvider,
            JwtAuthenticationConverter jwtAuthenticationConverter,
            CorsConfigurationSource corsConfigurationSource)
            throws Exception {

        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authenticationProvider(authenticationProvider)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    HttpMethod.POST, CHANGE_PASSWORD_PATH
                ).authenticated()
                // Stay signed in on a phone: a full (not temporary-password) session only.
                .requestMatchers(HttpMethod.POST, REMEMBER_DEVICE_PATH).hasAnyRole("EMPLOYEE", "HR_ADMIN")
                // The phone's push token, for the signed-in account (not a temporary-password session).
                .requestMatchers("/api/push/**").hasAnyRole("EMPLOYEE", "HR_ADMIN")
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/error").permitAll()
                // Server health (UP/DOWN only, no details) for Docker and monitoring.
                // Caddy blocks /actuator/* from the internet as well.
                .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
                .requestMatchers("/api/hr/**").hasRole("HR_ADMIN")
                .requestMatchers("/api/employee/**").hasRole("EMPLOYEE")
                .anyRequest().hasAnyRole("EMPLOYEE", "HR_ADMIN")
            )
            .oauth2ResourceServer(oauth2 ->
                oauth2.jwt(jwt ->
                    jwt.jwtAuthenticationConverter(jwtAuthenticationConverter)));

        return http.build();
    }
}
