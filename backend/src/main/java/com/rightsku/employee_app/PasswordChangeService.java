package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lets a signed-in user replace their password (required at first sign-in
 * for employees created with a temporary password).
 *
 * <ul>
 *   <li>The current password must be correct. Wrong guesses are limited by
 *       {@link LoginRateLimiter}, like sign-in.</li>
 *   <li>The new password must follow {@link PasswordPolicy} and differ from
 *       the current one.</li>
 *   <li>On success the password is stored only as a BCrypt hash, the
 *       "must change" flag is cleared and the session version increases, so
 *       every existing token (including the one used for this request) stops
 *       working. The user signs in again with the new password.</li>
 * </ul>
 */
@Service
public class PasswordChangeService {

    private static final Logger log = LoggerFactory.getLogger(PasswordChangeService.class);

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final LoginRateLimiter rateLimiter;
    private final AuditEntryRepository audit;
    private final Clock clock;

    public PasswordChangeService(
            AppUserRepository users,
            PasswordEncoder passwordEncoder,
            LoginRateLimiter rateLimiter,
            AuditEntryRepository audit,
            Clock clock) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.rateLimiter = rateLimiter;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public void changePassword(long userId, ChangePasswordRequest request, String address) {
        String limiterKey = "password-change:" + userId;
        rateLimiter.retryAfter(address, limiterKey).ifPresent(wait -> {
            throw new LoginRateLimitedException(wait);
        });

        AppUser user = users.findById(userId)
                .filter(AppUser::isActive)
                .orElseThrow(() -> ApiException.notFound("Account not found."));

        if (!matches(request.currentPassword(), user.getPasswordHash())) {
            rateLimiter.recordFailure(address, limiterKey);
            log.info("Password change refused: the current password was wrong.");
            throw ApiException.invalid("currentPassword", "Your current password is not correct.");
        }

        PasswordPolicy.problem(request.newPassword()).ifPresent(problem -> {
            throw ApiException.invalid("newPassword", problem);
        });
        if (matches(request.newPassword(), user.getPasswordHash())) {
            throw ApiException.invalid("newPassword", "Choose a password that is different from your current one.");
        }

        user.changePassword(passwordEncoder.encode(request.newPassword()), clock.instant());
        users.saveAndFlush(user);
        rateLimiter.recordSuccess(address, limiterKey);
        audit.save(AuditEntry.of(user.getId(), "PASSWORD_CHANGED", "USER", String.valueOf(user.getId())));
    }

    /** BCrypt only reads 72 bytes; longer input can never match and must not reach the encoder. */
    private boolean matches(String raw, String hash) {
        if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > PasswordPolicy.MAX_BYTES) {
            return false;
        }
        return passwordEncoder.matches(raw, hash);
    }
}
