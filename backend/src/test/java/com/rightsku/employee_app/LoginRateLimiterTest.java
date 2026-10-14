package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

/** Unit tests for login rate limiting. No Spring context or database. */
class LoginRateLimiterTest {

    private static final String IP = "203.0.113.10";
    private static final String OTHER_IP = "198.51.100.20";

    /** A clock the test can move forward. */
    static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-10-14T09:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }
    }

    private final TestClock clock = new TestClock();
    private final LoginRateLimiter limiter = new LoginRateLimiter(5, 30, Duration.ofMinutes(15), clock);

    private void fail(String ip, String user, int times) {
        for (int i = 0; i < times; i++) {
            limiter.recordFailure(ip, user);
        }
    }

    @Test
    void allowsUpToFourFailuresThenBlocksAfterTheFifth() {
        fail(IP, "EMP001", 4);
        assertThat(limiter.retryAfter(IP, "EMP001")).isEmpty();

        fail(IP, "EMP001", 1);
        assertThat(limiter.retryAfter(IP, "EMP001")).contains(Duration.ofMinutes(15));
    }

    @Test
    void blockEndsWhenTheWindowEnds() {
        fail(IP, "EMP001", 5);

        clock.advance(Duration.ofMinutes(14));
        assertThat(limiter.retryAfter(IP, "EMP001")).contains(Duration.ofMinutes(1));

        clock.advance(Duration.ofMinutes(1));
        assertThat(limiter.retryAfter(IP, "EMP001")).isEmpty();
    }

    @Test
    void failuresInAnOldWindowDoNotCount() {
        fail(IP, "EMP001", 4);
        clock.advance(Duration.ofMinutes(16));
        fail(IP, "EMP001", 4);

        assertThat(limiter.retryAfter(IP, "EMP001")).isEmpty();
    }

    @Test
    void successfulSignInClearsTheAccountCounter() {
        fail(IP, "EMP001", 4);
        limiter.recordSuccess(IP, "EMP001");
        fail(IP, "EMP001", 4);

        assertThat(limiter.retryAfter(IP, "EMP001")).isEmpty();
    }

    @Test
    void employeeIdIsCaseInsensitiveAndTrimmed() {
        fail(IP, "emp001", 3);
        fail(IP, " EMP001 ", 2);

        assertThat(limiter.retryAfter(IP, "Emp001")).isPresent();
    }

    @Test
    void attackerElsewhereCannotLockOutTheRealUser() {
        fail(OTHER_IP, "EMP001", 5);

        assertThat(limiter.retryAfter(OTHER_IP, "EMP001")).isPresent();
        assertThat(limiter.retryAfter(IP, "EMP001")).as("real user on another address").isEmpty();
    }

    @Test
    void oneAddressTryingManyAccountsIsBlocked() {
        for (int i = 0; i < 30; i++) {
            limiter.recordFailure(IP, "EMP" + i);
        }

        assertThat(limiter.retryAfter(IP, "EMP999")).as("any account from that address").isPresent();
        assertThat(limiter.retryAfter(OTHER_IP, "EMP999")).as("other addresses unaffected").isEmpty();
    }

    @Test
    void successDoesNotClearTheAddressCounter() {
        for (int i = 0; i < 29; i++) {
            limiter.recordFailure(IP, "EMP" + i);
        }
        limiter.recordSuccess(IP, "EMP001");
        limiter.recordFailure(IP, "EMP100");

        assertThat(limiter.retryAfter(IP, "EMP001")).isPresent();
    }

    @Test
    void invalidSettingsAreRejected() {
        assertThatThrownBy(() -> new LoginRateLimiter(0, 30, Duration.ofMinutes(15), clock))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new LoginRateLimiter(5, 30, Duration.ZERO, clock))
                .isInstanceOf(IllegalStateException.class);
    }
}
