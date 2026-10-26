
package com.rightsku.employee_app;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
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

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final AuthenticationManager authenticationManager;
    private final AppUserRepository appUserRepository;
    private final JwtService jwtService;
    private final LoginRateLimiter loginRateLimiter;
    private final PasswordChangeService passwordChangeService;
    private final RefreshTokenService refreshTokenService;

    public AuthController(
            AuthenticationManager authenticationManager,
            AppUserRepository appUserRepository,
            JwtService jwtService,
            LoginRateLimiter loginRateLimiter,
            PasswordChangeService passwordChangeService,
            RefreshTokenService refreshTokenService) {
        this.authenticationManager = authenticationManager;
        this.appUserRepository = appUserRepository;
        this.jwtService = jwtService;
        this.loginRateLimiter = loginRateLimiter;
        this.passwordChangeService = passwordChangeService;
        this.refreshTokenService = refreshTokenService;
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
            log.info("Sign-in refused: too many failed attempts; blocked for {} more seconds.", wait.toSeconds());
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
            // Server log only; the response is always the same 401. The typed
            // ID/email and password are never logged.
            log.info("Sign-in failed: {}.", ex instanceof DisabledException
                    ? "the account is inactive"
                    : "wrong password or unknown account");
            loginRateLimiter.recordFailure(address, username);
            throw ex;
        }
        loginRateLimiter.recordSuccess(address, username);

        // The principal name is the internal user ID (see AppUserDetailsService).
        AppUser user = appUserRepository.findById(Long.valueOf(authentication.getName()))
                .orElseThrow(() ->
                        new IllegalStateException("Authenticated user not found"));

        // No refresh token here: the phone asks for one (remember-device) only
        // after the person sets up a PIN or fingerprint unlock.
        return ResponseEntity.ok(sessionFor(user, null));
    }

    /**
     * A new sign-in token for a phone that stays signed in
     * (POST /api/auth/refresh). The same refresh token stays in use and is
     * extended. 401 when it no longer works: logged out, password changed or
     * reset, account deactivated, or unused for too long.
     */
    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        AppUser user = refreshTokenService.use(request.refreshToken())
                .orElseThrow(() -> new BadCredentialsException("Session ended"));
        return ResponseEntity.ok(sessionFor(user, request.refreshToken()));
    }

    /**
     * Stay signed in on this phone (POST /api/auth/remember-device): called by
     * the phone app only after the person sets up a PIN or fingerprint unlock.
     * Needs a full sign-in; a temporary-password session is refused (403).
     */
    @PostMapping("/remember-device")
    public ResponseEntity<RememberDeviceResponse> rememberDevice(@AuthenticationPrincipal Jwt jwt) {
        AppUser user = appUserRepository.findById(Long.parseLong(jwt.getSubject()))
                .orElseThrow(() -> new BadCredentialsException("Session ended"));
        return ResponseEntity.ok(new RememberDeviceResponse(refreshTokenService.issue(user)));
    }

    /**
     * Log out on this phone (POST /api/auth/logout): its refresh token stops
     * working. Always 204, so the answer says nothing about the token.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshTokenRequest request) {
        refreshTokenService.revoke(request.refreshToken());
        return ResponseEntity.noContent().build();
    }

    private LoginResponse sessionFor(AppUser user, String refreshToken) {
        return new LoginResponse(jwtService.generateToken(user), "Bearer",
                user.getId(), user.getLoginId(), user.getEmail(), user.getRole(),
                user.isMustChangePassword(), refreshToken);
    }

    /**
     * Replaces the signed-in user's password (POST /api/auth/change-password).
     * Works with a temporary-password token. On success (204) every existing
     * token of this account stops working, so the app signs in again with the
     * new password.
     */
    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            @AuthenticationPrincipal Jwt jwt,
            HttpServletRequest httpRequest) {
        passwordChangeService.changePassword(
                Long.parseLong(jwt.getSubject()), request, httpRequest.getRemoteAddr());
        return ResponseEntity.noContent().build();
    }
}
