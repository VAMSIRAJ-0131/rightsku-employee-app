package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.test.util.ReflectionTestUtils;

/** Unit tests: no database or Spring context needed. */
class JwtServiceTest {

    // Test-only value, never used outside tests.
    static final String TEST_SECRET = "test-only-jwt-secret-0123456789-abcdefghijklmnop";

    private final JwtService jwtService = new JwtService(TEST_SECRET, Duration.ofHours(8));

    /** Employees get an Employee ID; HR Admins sign in by email and have none. */
    static AppUser user(long id, String email, String role) {
        String loginId = AppUser.ROLE_EMPLOYEE.equals(role) ? "EMP" + id : null;
        AppUser user = AppUser.create(loginId, email, "not-a-real-hash", role);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    @Test
    void generatedTokenContainsExpectedClaimsAndExpiry() {
        String token = jwtService.generateToken(user(7L, "hr@rightsku.com", AppUser.ROLE_HR_ADMIN));

        Jwt jwt = jwtService.jwtDecoderFromConfiguredSecret().decode(token);

        // Subject is the stable internal user ID, not the email.
        assertThat(jwt.getSubject()).isEqualTo("7");
        assertThat(jwt.getClaimAsString("role")).isEqualTo("HR_ADMIN");
        assertThat(jwt.hasClaim("loginId")).isFalse();
        assertThat(((Number) jwt.getClaim("userId")).longValue()).isEqualTo(7L);
        assertThat(jwt.getClaimAsString("iss")).isEqualTo(JwtService.ISSUER);
        assertThat(Duration.between(jwt.getIssuedAt(), jwt.getExpiresAt())).isEqualTo(Duration.ofHours(8));
    }

    @Test
    void employeeTokenCarriesEmployeeId() {
        String token = jwtService.generateToken(user(12L, "emp@rightsku.com", AppUser.ROLE_EMPLOYEE));

        Jwt jwt = jwtService.jwtDecoderFromConfiguredSecret().decode(token);

        assertThat(jwt.getSubject()).isEqualTo("12");
        assertThat(jwt.getClaimAsString("loginId")).isEqualTo("EMP12");
        assertThat(jwt.getClaimAsString("role")).isEqualTo("EMPLOYEE");
    }

    @Test
    void tokenSignedWithDifferentSecretIsRejected() {
        JwtService other = new JwtService("another-test-only-secret-abcdefghijklmnopqrstuvwxyz", Duration.ofHours(8));
        String foreignToken = other.generateToken(user(1L, "a@rightsku.com", AppUser.ROLE_EMPLOYEE));

        JwtDecoder decoder = jwtService.jwtDecoderFromConfiguredSecret();
        assertThatThrownBy(() -> decoder.decode(foreignToken)).isInstanceOf(JwtException.class);
    }

    @Test
    void tamperedTokenIsRejected() {
        String token = jwtService.generateToken(user(1L, "a@rightsku.com", AppUser.ROLE_EMPLOYEE));
        String[] parts = token.split("\\.");
        // Swap the payload for one that claims HR_ADMIN, keeping the old signature.
        String forgedPayload = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
                "{\"sub\":\"1\",\"role\":\"HR_ADMIN\",\"iss\":\"rightsku-employee-app\"}".getBytes());
        String forged = parts[0] + "." + forgedPayload + "." + parts[2];

        JwtDecoder decoder = jwtService.jwtDecoderFromConfiguredSecret();
        assertThatThrownBy(() -> decoder.decode(forged)).isInstanceOf(JwtException.class);
    }

    @Test
    void expiredTokenIsRejected() {
        Clock nineHoursAgo = Clock.fixed(Instant.now().minus(Duration.ofHours(9)), ZoneOffset.UTC);
        JwtService past = new JwtService(TEST_SECRET, Duration.ofHours(8), nineHoursAgo);
        String expired = past.generateToken(user(1L, "a@rightsku.com", AppUser.ROLE_EMPLOYEE));

        JwtDecoder decoder = jwtService.jwtDecoderFromConfiguredSecret();
        assertThatThrownBy(() -> decoder.decode(expired)).isInstanceOf(JwtException.class);
    }

    @Test
    void missingOrShortSecretFailsAtStartup() {
        assertThatThrownBy(() -> new JwtService("", Duration.ofHours(8)))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new JwtService("too-short-secret", Duration.ofHours(8)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("too-short-secret");
    }

    @Test
    void nonPositiveExpiryIsRejected() {
        assertThatThrownBy(() -> new JwtService(TEST_SECRET, Duration.ZERO))
                .isInstanceOf(IllegalStateException.class);
    }
}
