
package com.rightsku.employee_app;

import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    static final int MAX_PASSWORD_BYTES = 72;

    private final AuthenticationManager authenticationManager;
    private final AppUserRepository appUserRepository;
    private final JwtService jwtService;

    public AuthController(
            AuthenticationManager authenticationManager,
            AppUserRepository appUserRepository,
            JwtService jwtService) {
        this.authenticationManager = authenticationManager;
        this.appUserRepository = appUserRepository;
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request) {

        String email = request.email().trim();

        // BCrypt only uses the first 72 bytes and Spring rejects longer
        // input with an exception (HTTP 500). Such a password can never
        // match a stored hash, so answer like any other wrong password.
        if (request.password().getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new BadCredentialsException("Invalid email or password");
        }

        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        email, request.password()));

        AppUser user = appUserRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() ->
                        new IllegalStateException("Authenticated user not found"));

        String token = jwtService.generateToken(user);

        return ResponseEntity.ok(
                new LoginResponse(token, "Bearer",
                        user.getId(), user.getEmail(), user.getRole()));
    }
}
