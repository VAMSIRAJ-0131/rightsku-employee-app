package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/** Unit tests for changing a password. Repositories are mocked: no database is touched. */
class PasswordChangeServiceTest {

    // Test-only values.
    private static final String TEMPORARY = "Temporary-Passw0rd!";
    private static final String CHOSEN = "My-Own-New-Passw0rd";
    private static final String ADDRESS = "203.0.113.5";
    private static final Instant NOW = Instant.parse("2026-10-14T06:30:00Z");

    private AppUserRepository users;
    private AuditEntryRepository audit;
    private PasswordEncoder encoder;
    private LoginRateLimiter limiter;
    private PasswordChangeService service;
    private AppUser employee;

    @BeforeEach
    void setUp() {
        users = mock(AppUserRepository.class);
        audit = mock(AuditEntryRepository.class);
        encoder = new BCryptPasswordEncoder(4); // low cost keeps tests fast
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        limiter = new LoginRateLimiter(5, 30, Duration.ofMinutes(15), clock);
        service = new PasswordChangeService(users, encoder, limiter, audit, clock);

        employee = AppUser.create("EMP001", "emp@rightsku.com", encoder.encode(TEMPORARY), AppUser.ROLE_EMPLOYEE);
        employee.requirePasswordChange();
        ReflectionTestUtils.setField(employee, "id", 2L);
        when(users.findById(2L)).thenReturn(Optional.of(employee));
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    @Test
    void newPasswordReplacesTemporaryOneClearsFlagAndEndsSessions() {
        int versionBefore = employee.getSessionVersion();

        service.changePassword(2L, new ChangePasswordRequest(TEMPORARY, CHOSEN), ADDRESS);

        assertThat(employee.isMustChangePassword()).isFalse();
        assertThat(employee.getSessionVersion()).isEqualTo(versionBefore + 1);
        assertThat(employee.getPasswordChangedAt()).isEqualTo(NOW);
        assertThat(encoder.matches(CHOSEN, employee.getPasswordHash())).isTrue();
        assertThat(encoder.matches(TEMPORARY, employee.getPasswordHash())).isFalse();
        assertThat(employee.getPasswordHash()).startsWith("$2").doesNotContain(CHOSEN);
        verify(users).saveAndFlush(employee);

        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("PASSWORD_CHANGED");
        assertThat(entry.getValue().getActorUserId()).isEqualTo(2L);
    }

    @Test
    void wrongCurrentPasswordIsRefusedAndNothingChanges() {
        String hashBefore = employee.getPasswordHash();

        Throwable thrown = catchThrowable(() ->
                service.changePassword(2L, new ChangePasswordRequest("Not-The-Passw0rd", CHOSEN), ADDRESS));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "currentPassword");
        assertThat(employee.getPasswordHash()).isEqualTo(hashBefore);
        assertThat(employee.isMustChangePassword()).isTrue();
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void newPasswordMustFollowThePasswordRules() {
        for (String weak : new String[] {"short-1", " Leading-space-pw", "é".repeat(40)}) {
            Throwable thrown = catchThrowable(() ->
                    service.changePassword(2L, new ChangePasswordRequest(TEMPORARY, weak), ADDRESS));
            assertApiError(thrown, HttpStatus.BAD_REQUEST, "newPassword");
        }
        assertThat(employee.isMustChangePassword()).isTrue();
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void newPasswordMustDifferFromCurrent() {
        Throwable thrown = catchThrowable(() ->
                service.changePassword(2L, new ChangePasswordRequest(TEMPORARY, TEMPORARY), ADDRESS));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "newPassword");
        assertThat(employee.isMustChangePassword()).isTrue();
    }

    @Test
    void repeatedWrongCurrentPasswordsAreRateLimited() {
        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> service.changePassword(
                    2L, new ChangePasswordRequest("Not-The-Passw0rd", CHOSEN), ADDRESS))
                    .isInstanceOf(ApiException.class);
        }
        // Blocked before the password is checked, even with the right one.
        assertThatThrownBy(() -> service.changePassword(2L, new ChangePasswordRequest(TEMPORARY, CHOSEN), ADDRESS))
                .isInstanceOf(LoginRateLimitedException.class);
        assertThat(employee.isMustChangePassword()).isTrue();
    }

    @Test
    void inactiveOrMissingAccountCannotChangePassword() {
        employee.deactivate();
        Throwable inactive = catchThrowable(() ->
                service.changePassword(2L, new ChangePasswordRequest(TEMPORARY, CHOSEN), ADDRESS));
        assertApiError(inactive, HttpStatus.NOT_FOUND, null);

        Throwable missing = catchThrowable(() ->
                service.changePassword(99L, new ChangePasswordRequest(TEMPORARY, CHOSEN), ADDRESS));
        assertApiError(missing, HttpStatus.NOT_FOUND, null);
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void currentPasswordLongerThanBcryptLimitIsWrongNotAnError() {
        Throwable thrown = catchThrowable(() ->
                service.changePassword(2L, new ChangePasswordRequest("é".repeat(40), CHOSEN), ADDRESS));
        assertApiError(thrown, HttpStatus.BAD_REQUEST, "currentPassword");
    }
}
