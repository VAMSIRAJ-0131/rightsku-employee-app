package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Forgot-password rules: same answer for every account, emailed single-use
 * code, expiry, attempt limit, password rules. Repositories and the mailer are
 * mocked (no database, no email); the clock is moved by hand.
 */
class PasswordResetServiceTest {

    private static final String ADDRESS = "203.0.113.7";
    private static final String NEW_PASSWORD = "Test-Only-New-1";

    /** Low cost so the tests stay fast; production uses cost 12. */
    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-23T06:30:00Z"));
    private final Clock clock = new Clock() {
        @Override public ZoneId getZone() { return ZoneId.of("Asia/Kolkata"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
    };

    private AppUserRepository users;
    private PasswordResetCodeRepository codes;
    private PasswordResetMailer mailer;
    private AuditEntryRepository audit;
    private PasswordResetService service;
    private final List<PasswordResetCode> savedCodes = new ArrayList<>();
    private AppUser ravi;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        users = mock(AppUserRepository.class);
        codes = mock(PasswordResetCodeRepository.class);
        mailer = mock(PasswordResetMailer.class);
        audit = mock(AuditEntryRepository.class);
        when(mailer.available()).thenReturn(true);
        ObjectProvider<TaskExecutor> noPool = mock(ObjectProvider.class);   // the mail is then sent at once
        LoginRateLimiter limiter = new LoginRateLimiter(5, 30, Duration.ofMinutes(15), clock);
        service = new PasswordResetService(new AppUserDetailsService(users), users, codes, encoder, mailer, limiter,
                audit, noPool, clock);

        ravi = AppUser.create("10002", "ravi@rightsku.com", encoder.encode("Old-Password-1"), AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(ravi, "id", 2L);
        when(users.findByLoginIdIgnoreCase("10002")).thenReturn(Optional.of(ravi));

        when(codes.save(any(PasswordResetCode.class))).thenAnswer(call -> {
            PasswordResetCode c = call.getArgument(0);
            if (!savedCodes.contains(c)) {
                ReflectionTestUtils.setField(c, "id", 700L + savedCodes.size());
                savedCodes.add(c);
            }
            return c;
        });
        when(codes.findFirstByUserIdOrderByCreatedAtDescIdDesc(any())).thenAnswer(call -> savedCodes.stream()
                .filter(c -> c.getUserId().equals(call.getArgument(0)))
                .max(Comparator.comparing(PasswordResetCode::getCreatedAt).thenComparing(PasswordResetCode::getId)));
        when(codes.findByUserIdAndUsedAtIsNull(any())).thenAnswer(call -> savedCodes.stream()
                .filter(c -> c.getUserId().equals(call.getArgument(0)) && c.getUsedAt() == null).toList());
        when(codes.countByUserIdAndCreatedAtAfter(any(), any())).thenAnswer(call -> savedCodes.stream()
                .filter(c -> c.getUserId().equals(call.getArgument(0))
                        && c.getCreatedAt().isAfter(call.getArgument(1))).count());
    }

    /** Asks for a code and returns the one that was emailed. */
    private String requestCode() {
        service.request(" 10002 ");
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(mailer, org.mockito.Mockito.atLeastOnce()).send(eq("ravi@rightsku.com"), code.capture(), eq(PasswordResetService.VALID_FOR));
        return code.getValue();
    }

    private static PasswordResetConfirmRequest confirm(String code, String password) {
        return new PasswordResetConfirmRequest("10002", code, password, password);
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    @Test
    void aCodeIsEmailedToTheRegisteredAddressAndOnlyItsHashIsStored() {
        String code = requestCode();

        assertThat(code).matches("\\d{6}");
        assertThat(savedCodes).hasSize(1);
        PasswordResetCode stored = savedCodes.get(0);
        assertThat(stored.getCodeHash()).isNotEqualTo(code).startsWith("$2");
        assertThat(encoder.matches(code, stored.getCodeHash())).isTrue();
        assertThat(stored.getExpiresAt()).isEqualTo(now.get().plus(Duration.ofMinutes(15)));
    }

    @Test
    void unknownInactiveOrEmployeeEmailAccountsGetNoCodeAndNoEmail() {
        AppUser inactive = AppUser.create("10009", "old@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(inactive, "id", 9L);
        inactive.deactivate();
        when(users.findByLoginIdIgnoreCase("10009")).thenReturn(Optional.of(inactive));
        when(users.findByEmailIgnoreCase("ravi@rightsku.com")).thenReturn(Optional.of(ravi));

        service.request("NOBODY1");
        service.request("10009");
        service.request("ravi@rightsku.com");   // employees reset with their Employee ID, like sign-in
        service.request("not a valid id!");

        assertThat(savedCodes).isEmpty();
        verify(mailer, never()).send(anyString(), anyString(), any());
    }

    @Test
    void whenEmailIsNotSetUpTheFeatureSaysSoForEveryAccount() {
        when(mailer.available()).thenReturn(false);

        assertThat(service.available()).isFalse();
        assertApiError(catchThrowable(() -> service.request("10002")), HttpStatus.SERVICE_UNAVAILABLE, null);
        assertApiError(catchThrowable(() -> service.request("NOBODY1")), HttpStatus.SERVICE_UNAVAILABLE, null);
        assertThat(savedCodes).isEmpty();
    }

    @Test
    void theRightCodeSetsTheNewPasswordEndsSessionsAndWorksOnce() {
        String code = requestCode();
        int sessionBefore = ravi.getSessionVersion();

        service.confirm(confirm(code, NEW_PASSWORD), ADDRESS);

        assertThat(encoder.matches(NEW_PASSWORD, ravi.getPasswordHash())).isTrue();
        assertThat(ravi.getSessionVersion()).as("older sessions end").isEqualTo(sessionBefore + 1);
        assertThat(savedCodes.get(0).getUsedAt()).isNotNull();
        verify(users).saveAndFlush(ravi);
        assertApiError(catchThrowable(() -> service.confirm(confirm(code, "Another-Pass-2"), ADDRESS)),
                HttpStatus.BAD_REQUEST, "code");
    }

    @Test
    void wrongExpiredAndUnknownCodesAllGetTheSameAnswer() {
        String code = requestCode();
        String wrong = code.equals("000000") ? "111111" : "000000";

        Throwable wrongCode = catchThrowable(() -> service.confirm(confirm(wrong, NEW_PASSWORD), ADDRESS));
        Throwable badFormat = catchThrowable(() -> service.confirm(confirm("12ab", NEW_PASSWORD), ADDRESS));
        Throwable unknown = catchThrowable(() -> service.confirm(
                new PasswordResetConfirmRequest("NOBODY1", code, NEW_PASSWORD, NEW_PASSWORD), ADDRESS));
        now.set(now.get().plus(Duration.ofMinutes(16)));
        Throwable expired = catchThrowable(() -> service.confirm(confirm(code, NEW_PASSWORD), "198.51.100.2"));

        for (Throwable t : List.of(wrongCode, badFormat, unknown, expired)) {
            assertApiError(t, HttpStatus.BAD_REQUEST, "code");
            assertThat(t).hasMessage(PasswordResetService.WRONG_CODE);
        }
        assertThat(encoder.matches("Old-Password-1", ravi.getPasswordHash())).as("password unchanged").isTrue();
    }

    @Test
    void aCodeStopsWorkingAfterFiveWrongTries() {
        String code = requestCode();
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int i = 0; i < PasswordResetCode.MAX_ATTEMPTS; i++) {
            // A different address each time, so only the per-code limit is tested here.
            catchThrowable(() -> service.confirm(confirm(wrong, NEW_PASSWORD), "198.51.100." + savedCodes.size() + now.get().getNano()));
            now.set(now.get().plusSeconds(1));
        }

        assertApiError(catchThrowable(() -> service.confirm(confirm(code, NEW_PASSWORD), "192.0.2.50")),
                HttpStatus.BAD_REQUEST, "code");
        assertThat(savedCodes.get(0).getFailedAttempts()).isEqualTo(PasswordResetCode.MAX_ATTEMPTS);
    }

    @Test
    void aNewCodeEndsTheOlderOne() {
        String first = requestCode();
        now.set(now.get().plusSeconds(30));
        String second = requestCode();

        assertThat(savedCodes).hasSize(2);
        assertThat(savedCodes.get(0).getUsedAt()).as("older code ended").isNotNull();
        if (!first.equals(second)) {
            assertApiError(catchThrowable(() -> service.confirm(confirm(first, NEW_PASSWORD), ADDRESS)),
                    HttpStatus.BAD_REQUEST, "code");
        }
        service.confirm(confirm(second, NEW_PASSWORD), ADDRESS);
        assertThat(encoder.matches(NEW_PASSWORD, ravi.getPasswordHash())).isTrue();
    }

    @Test
    void atMostThreeEmailsPerAccountPerHour() {
        for (int i = 0; i < 5; i++) {
            service.request("10002");
            now.set(now.get().plusSeconds(60));
        }
        assertThat(savedCodes).hasSize(PasswordResetService.MAX_CODES_PER_HOUR);
        verify(mailer, org.mockito.Mockito.times(3)).send(anyString(), anyString(), any());
    }

    @Test
    void theNewPasswordFollowsTheRulesAndARefusalKeepsTheCode() {
        String code = requestCode();

        assertApiError(catchThrowable(() -> service.confirm(confirm(code, "short"), ADDRESS)), HttpStatus.BAD_REQUEST, "newPassword");
        assertApiError(catchThrowable(() -> service.confirm(
                new PasswordResetConfirmRequest("10002", code, NEW_PASSWORD, "Different-Pass-9"), ADDRESS)),
                HttpStatus.BAD_REQUEST, "confirmPassword");
        assertThat(savedCodes.get(0).getUsedAt()).as("still usable").isNull();

        service.confirm(confirm(code, NEW_PASSWORD), ADDRESS);
        assertThat(encoder.matches(NEW_PASSWORD, ravi.getPasswordHash())).isTrue();
    }

    @Test
    void anEmployeeDeactivatedAfterAskingCannotUseTheirCode() {
        String code = requestCode();
        ravi.deactivate();   // HR deactivates the account while the email is on its way

        assertApiError(catchThrowable(() -> service.confirm(confirm(code, NEW_PASSWORD), ADDRESS)), HttpStatus.BAD_REQUEST, "code");
        assertThat(encoder.matches("Old-Password-1", ravi.getPasswordHash())).as("password unchanged").isTrue();
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void oneEmployeesCodeCannotResetAnotherEmployeesPassword() {
        AppUser priya = AppUser.create("10003", "priya@rightsku.com", encoder.encode("Priya-Old-Pass-1"), AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(priya, "id", 4L);
        when(users.findByLoginIdIgnoreCase("10003")).thenReturn(Optional.of(priya));
        String ravisCode = requestCode();

        Throwable thrown = catchThrowable(() -> service.confirm(
                new PasswordResetConfirmRequest("10003", ravisCode, NEW_PASSWORD, NEW_PASSWORD), ADDRESS));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "code");
        assertThat(encoder.matches("Priya-Old-Pass-1", priya.getPasswordHash())).isTrue();
        assertThat(savedCodes.get(0).getUsedAt()).as("Ravi's code is untouched").isNull();
    }

    @Test
    void anHrAdminNeedsTheStricterPasswordRule() {
        AppUser hr = AppUser.create(null, "hr@rightsku.com", encoder.encode("Hr-Old-Password-1"), AppUser.ROLE_HR_ADMIN);
        ReflectionTestUtils.setField(hr, "id", 1L);
        when(users.findByEmailIgnoreCase("hr@rightsku.com")).thenReturn(Optional.of(hr));
        service.request("hr@rightsku.com");
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(mailer).send(eq("hr@rightsku.com"), code.capture(), any());

        assertApiError(catchThrowable(() -> service.confirm(
                new PasswordResetConfirmRequest("hr@rightsku.com", code.getValue(), "Short-Pass1", "Short-Pass1"), ADDRESS)),
                HttpStatus.BAD_REQUEST, "newPassword");
        service.confirm(new PasswordResetConfirmRequest("hr@rightsku.com", code.getValue(), "Long-Enough-Pass-12", "Long-Enough-Pass-12"), ADDRESS);
        assertThat(encoder.matches("Long-Enough-Pass-12", hr.getPasswordHash())).isTrue();
    }

    @Test
    void codesAreSixRandomDigits() {
        for (int i = 0; i < 200; i++) {
            assertThat(PasswordResetService.newCode()).matches("\\d{6}");
        }
    }
}
