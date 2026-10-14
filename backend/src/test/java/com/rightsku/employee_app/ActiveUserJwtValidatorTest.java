package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;

/** Unit tests for the per-request account checks on a token. No database or Spring context. */
class ActiveUserJwtValidatorTest {

    private AppUserRepository users;
    private ActiveUserJwtValidator validator;
    private AppUser employee;

    @BeforeEach
    void setUp() {
        users = mock(AppUserRepository.class);
        validator = new ActiveUserJwtValidator(users);
        employee = AppUser.create("EMP001", "emp@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(employee, "id", 2L);
        when(users.findById(2L)).thenReturn(Optional.of(employee));
    }

    private static Jwt.Builder token() {
        return Jwt.withTokenValue("test-only")
                .header("alg", "HS256")
                .subject("2")
                .issuedAt(Instant.parse("2026-10-14T00:00:00Z"))
                .expiresAt(Instant.parse("2026-10-14T08:00:00Z"))
                .claim("role", AppUser.ROLE_EMPLOYEE);
    }

    private boolean valid(Jwt jwt) {
        return !validator.validate(jwt).hasErrors();
    }

    @Test
    void currentTokenIsAccepted() {
        assertThat(valid(token().claim("sv", 0).claim("pwc", false).build())).isTrue();
    }

    @Test
    void tokenFromBeforeVersionFourWithoutNewClaimsStillWorksForNormalAccount() {
        assertThat(valid(token().build())).isTrue();
    }

    @Test
    void tokenFromBeforeAPasswordChangeIsRejected() {
        Jwt before = token().claim("sv", 0).claim("pwc", false).build();
        employee.changePassword("new-hash", Instant.parse("2026-10-14T01:00:00Z"));

        assertThat(valid(before)).isFalse();
        assertThat(valid(token().claim("sv", 1).claim("pwc", false).build())).isTrue();
    }

    @Test
    void passwordChangeFlagMustMatchTheAccount() {
        employee.requirePasswordChange();
        assertThat(valid(token().claim("sv", 0).claim("pwc", false).build()))
                .as("normal token after HR set a temporary password").isFalse();
        assertThat(valid(token().claim("sv", 0).claim("pwc", true).build())).isTrue();
        // Old tokens without the flag count as "no change required", so they are rejected too.
        assertThat(valid(token().build())).isFalse();
    }

    @Test
    void wrongRoleInactiveOrUnknownUserIsRejected() {
        assertThat(valid(token().claim("role", AppUser.ROLE_HR_ADMIN).build())).isFalse();
        assertThat(valid(token().subject("99").build())).isFalse();
        assertThat(valid(token().subject("not-a-number").build())).isFalse();
        assertThat(valid(token().claim("sv", "1").build())).as("non-number version").isFalse();
        employee.deactivate();
        assertThat(valid(token().build())).isFalse();
    }
}
