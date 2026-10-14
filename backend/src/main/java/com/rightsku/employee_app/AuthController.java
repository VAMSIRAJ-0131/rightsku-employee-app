
package com.rightsku.employee_app;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
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
    private final LoginRateLimiter loginRateLimiter;

    public AuthController(
            AuthenticationManager authenticationManager,
            AppUserRepository appUserRepository,
            JwtService jwtService,
            LoginRateLimiter loginRateLimiter) {
        this.authenticationManager = authenticationManager;
        this.appUserRepository = appUserRepository;
        this.jwtService = jwtService;
        this.loginRateLimiter = loginRateLimiter;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {

        String username = request.username().trim();
        String address = httpRequest.getRemoteAddr();

        // Too many recent failures: refuse before checking the password, so
        // blocked attempts reveal nothing (HTTP 429 with Retry-After).
        loginRateLimiter.retryAfter(address, username).ifPresent(wait -> {
            throw new LoginRateLimitedException(wait);
        });

        Authentication authentication;
        try {
            // BCrypt only uses the first 72 bytes and Spring rejects longer
            // input with an exception (HTTP 500). Such a password can never
            // match a stored hash, so answer like any other wrong password.
            if (request.password().getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
                throw new BadCredentialsException("Invalid credentials");
            }
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            username, request.password()));
        } catch (AuthenticationException ex) {
            loginRateLimiter.recordFailure(address, username);
            throw ex;
        }
        loginRateLimiter.recordSuccess(address, username);

        // The principal name is the internal user ID (see AppUserDetailsService).
        AppUser user = appUserRepository.findById(Long.valueOf(authentication.getName()))
                .orElseThrow(() ->
                        new IllegalStateException("Authenticated user not found"));

        String token = jwtService.generateToken(user);

        return ResponseEntity.ok(
                new LoginResponse(token, "Bearer",
                        user.getId(), user.getLoginId(), user.getEmail(), user.getRole()));
    }
}
