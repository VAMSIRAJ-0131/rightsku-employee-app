package com.rightsku.employee_app;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Simple in-memory protection against password guessing on POST /api/auth/login.
 *
 * Only FAILED sign-ins are counted, in fixed windows (default 15 minutes):
 * <ul>
 *   <li>Per account and network address: after 5 failures for the same
 *       Employee ID / email from the same address, that pair is blocked until
 *       the window ends. Keying on the address too means someone elsewhere
 *       cannot lock a real employee out just by guessing their ID.</li>
 *   <li>Per network address: after 30 failures from one address (across any
 *       accounts), that address is blocked until the window ends. This stops
 *       one machine from trying many accounts.</li>
 * </ul>
 * A successful sign-in clears the account counter for that address.
 *
 * Limits: counters live in this server's memory, so they reset on restart and
 * are not shared between several backend instances. The address is the
 * direct client address (request.getRemoteAddr()); behind a reverse proxy,
 * forwarded headers must be configured so each user's real address is used.
 */
@Component
public class LoginRateLimiter {

    /** Upper bound on tracked keys, so the tables cannot grow without limit. */
    static final int MAX_TRACKED_KEYS = 50_000;

    private final int maxFailuresPerAccount;
    private final int maxFailuresPerAddress;
    private final Duration window;
    private final Clock clock;

    private final Map<String, Counter> accountCounters = new ConcurrentHashMap<>();
    private final Map<String, Counter> addressCounters = new ConcurrentHashMap<>();

    private record Counter(int failures, Instant windowStart) {
    }

    @Autowired
    public LoginRateLimiter(
            @Value("${app.login.rate-limit.max-failures-per-account:5}") int maxFailuresPerAccount,
            @Value("${app.login.rate-limit.max-failures-per-address:30}") int maxFailuresPerAddress,
            @Value("${app.login.rate-limit.window:15m}") Duration window) {
        this(maxFailuresPerAccount, maxFailuresPerAddress, window, Clock.systemUTC());
    }

    /** Also used by tests with a controllable clock. */
    LoginRateLimiter(int maxFailuresPerAccount, int maxFailuresPerAddress, Duration window, Clock clock) {
        if (maxFailuresPerAccount < 1 || maxFailuresPerAddress < 1) {
            throw new IllegalStateException("Login rate limits must be at least 1.");
        }
        if (window == null || window.isZero() || window.isNegative()) {
            throw new IllegalStateException("app.login.rate-limit.window must be a positive duration.");
        }
        this.maxFailuresPerAccount = maxFailuresPerAccount;
        this.maxFailuresPerAddress = maxFailuresPerAddress;
        this.window = window;
        this.clock = clock;
    }

    /**
     * Returns how long the caller must wait, or empty if the attempt may go ahead.
     * Called before the password is checked.
     */
    public Optional<Duration> retryAfter(String address, String username) {
        Instant now = clock.instant();
        Duration wait = longest(
                blockedFor(addressCounters.get(addressKey(address)), maxFailuresPerAddress, now),
                blockedFor(accountCounters.get(accountKey(address, username)), maxFailuresPerAccount, now));
        return wait.isZero() ? Optional.empty() : Optional.of(wait);
    }

    /** Records a failed sign-in (wrong password, unknown or inactive account). */
    public void recordFailure(String address, String username) {
        Instant now = clock.instant();
        pruneIfLarge(now);
        addressCounters.compute(addressKey(address), (k, c) -> increment(c, now));
        accountCounters.compute(accountKey(address, username), (k, c) -> increment(c, now));
    }

    /** Clears the account counter after a successful sign-in from this address. */
    public void recordSuccess(String address, String username) {
        accountCounters.remove(accountKey(address, username));
    }

    /** Clears all counters. Used by tests. */
    void reset() {
        accountCounters.clear();
        addressCounters.clear();
    }

    private Counter increment(Counter current, Instant now) {
        if (current == null || isExpired(current, now)) {
            return new Counter(1, now);
        }
        return new Counter(current.failures() + 1, current.windowStart());
    }

    private Duration blockedFor(Counter counter, int max, Instant now) {
        if (counter == null || isExpired(counter, now) || counter.failures() < max) {
            return Duration.ZERO;
        }
        return Duration.between(now, counter.windowStart().plus(window));
    }

    private boolean isExpired(Counter counter, Instant now) {
        return !now.isBefore(counter.windowStart().plus(window));
    }

    private void pruneIfLarge(Instant now) {
        if (accountCounters.size() + addressCounters.size() > MAX_TRACKED_KEYS) {
            accountCounters.values().removeIf(c -> isExpired(c, now));
            addressCounters.values().removeIf(c -> isExpired(c, now));
        }
    }

    private static Duration longest(Duration a, Duration b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    private static String addressKey(String address) {
        return address == null ? "unknown" : address;
    }

    /** Employee IDs and emails are case-insensitive, so EMP001 and emp001 share a counter. */
    private static String accountKey(String address, String username) {
        String name = username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
        return addressKey(address) + "|" + name;
    }
}
