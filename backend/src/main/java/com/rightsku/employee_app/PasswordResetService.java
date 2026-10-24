package com.rightsku.employee_app;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.task.TaskExecutor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * "Forgot password": a 6-digit code emailed to the account's registered address.
 *
 * <ul>
 *   <li><b>No account enumeration.</b> Asking for a code always gets the same
 *       answer, whether or not the ID/email exists, the account is active or
 *       a code was sent. A wrong code, an unknown account and an expired code
 *       also get one same answer. Unknown accounts still run a BCrypt check,
 *       and the email is sent after the reply on a background thread, so the
 *       response time does not reveal accounts either.</li>
 *   <li><b>Identity.</b> The code goes only to the email address already on
 *       the account (set by HR), never to an address typed in the request.</li>
 *   <li><b>Single use, short life.</b> Only a BCrypt hash is stored. A code
 *       expires after {@link #VALID_FOR}, allows {@link PasswordResetCode#MAX_ATTEMPTS}
 *       wrong tries, works once, and a newer code ends every older one.</li>
 *   <li><b>Limits.</b> At most {@link #MAX_CODES_PER_HOUR} emails per account
 *       per hour; wrong codes count towards the sign-in rate limit.</li>
 *   <li>A successful reset follows the normal password rules, clears any
 *       temporary-password flag and ends every existing session.</li>
 * </ul>
 */
@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    static final Duration VALID_FOR = Duration.ofMinutes(15);
    static final int MAX_CODES_PER_HOUR = 3;
    static final String WRONG_CODE = "This code is wrong or has expired. Check the latest email, or ask for a new code.";
    static final String NOT_SET_UP =
            "Password reset by email is not set up yet. Contact HR to reset your password.";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppUserDetailsService accounts;
    private final AppUserRepository users;
    private final PasswordResetCodeRepository codes;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetMailer mailer;
    private final LoginRateLimiter rateLimiter;
    private final AuditEntryRepository audit;
    private final ObjectProvider<TaskExecutor> executor;
    private final Clock clock;
    /** A hash of a random value, checked for unknown accounts so they take as long as real ones. */
    private final String dummyHash;

    public PasswordResetService(
            AppUserDetailsService accounts,
            AppUserRepository users,
            PasswordResetCodeRepository codes,
            PasswordEncoder passwordEncoder,
            PasswordResetMailer mailer,
            LoginRateLimiter rateLimiter,
            AuditEntryRepository audit,
            ObjectProvider<TaskExecutor> executor,
            Clock clock) {
        this.accounts = accounts;
        this.users = users;
        this.codes = codes;
        this.passwordEncoder = passwordEncoder;
        this.mailer = mailer;
        this.rateLimiter = rateLimiter;
        this.audit = audit;
        this.executor = executor;
        this.clock = clock;
        this.dummyHash = passwordEncoder.encode(newCode());
    }

    public boolean available() {
        return mailer.available();
    }

    /**
     * Sends a code if the ID/email belongs to an active account. Always
     * returns normally (the caller gives one fixed answer), except when email
     * is not set up at all, which is the same for every account.
     */
    @Transactional
    public void request(String identifier) {
        if (!mailer.available()) {
            throw ApiException.unavailable(NOT_SET_UP);
        }
        Optional<AppUser> account = accounts.findForLogin(identifier).filter(AppUser::isActive);
        if (account.isEmpty()) {
            passwordEncoder.encode(newCode());   // same work as a real request
            log.info("Password reset requested for no active account; nothing sent.");
            return;
        }
        AppUser user = account.get();
        Instant now = clock.instant();
        if (codes.countByUserIdAndCreatedAtAfter(user.getId(), now.minus(Duration.ofHours(1))) >= MAX_CODES_PER_HOUR) {
            passwordEncoder.encode(newCode());
            log.info("Password reset requested for user {}; limit of {} codes per hour reached, nothing sent.",
                    user.getId(), MAX_CODES_PER_HOUR);
            return;
        }

        codes.findByUserIdAndUsedAtIsNull(user.getId()).forEach(old -> {
            old.end(now);
            codes.save(old);
        });
        String code = newCode();
        codes.save(PasswordResetCode.issue(user.getId(), passwordEncoder.encode(code), now, now.plus(VALID_FOR)));
        audit.save(AuditEntry.of(user.getId(), "PASSWORD_RESET_REQUESTED", "USER", String.valueOf(user.getId())));
        log.info("Password reset code issued for user {}.", user.getId());

        String email = user.getEmail();
        afterCommit(() -> mailer.send(email, code, VALID_FOR));
    }

    /** Checks the code and sets the new password. Every refusal about the code is the same 400. */
    @Transactional
    public void confirm(PasswordResetConfirmRequest request, String address) {
        String limiterKey = "password-reset:" + request.username().trim().toLowerCase(Locale.ROOT);
        rateLimiter.retryAfter(address, limiterKey).ifPresent(wait -> {
            throw new LoginRateLimitedException(wait);
        });

        Instant now = clock.instant();
        Optional<AppUser> account = accounts.findForLogin(request.username()).filter(AppUser::isActive);
        Optional<PasswordResetCode> latest = account
                .flatMap(u -> codes.findFirstByUserIdOrderByCreatedAtDescIdDesc(u.getId()))
                .filter(c -> c.usableAt(now));
        String code = request.code() == null ? "" : request.code().trim();
        boolean wellFormed = code.matches("\\d{6}");

        if (latest.isEmpty() || !wellFormed || !passwordEncoder.matches(code, latest.get().getCodeHash())) {
            if (latest.isEmpty()) {
                passwordEncoder.matches(code, dummyHash);   // same work as a real check
            } else {
                latest.get().recordFailedAttempt();
                codes.save(latest.get());
            }
            rateLimiter.recordFailure(address, limiterKey);
            log.info("Password reset refused: wrong, expired or unknown code.");
            throw ApiException.invalid("code", WRONG_CODE);
        }

        AppUser user = account.get();
        PasswordPolicy.problemForOwnPassword(user.getRole(), request.newPassword()).ifPresent(problem -> {
            throw ApiException.invalid("newPassword", problem);
        });
        if (!request.newPassword().equals(request.confirmPassword())) {
            throw ApiException.invalid("confirmPassword", "The two new passwords don't match.");
        }

        user.changePassword(passwordEncoder.encode(request.newPassword()), now);
        users.saveAndFlush(user);
        codes.findByUserIdAndUsedAtIsNull(user.getId()).forEach(open -> {
            open.end(now);
            codes.save(open);
        });
        rateLimiter.recordSuccess(address, limiterKey);
        audit.save(AuditEntry.of(user.getId(), "PASSWORD_RESET", "USER", String.valueOf(user.getId())));
        log.info("Password reset for user {}; older sessions have ended.", user.getId());
    }

    /** Six random digits, 000000 to 999999. */
    static String newCode() {
        return String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
    }

    /** Runs after the database commit (so the code exists), off the request thread when possible. */
    private void afterCommit(Runnable task) {
        Runnable background = () -> {
            TaskExecutor pool = executor.getIfUnique();
            if (pool != null) {
                pool.execute(task);
            } else {
                task.run();
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    background.run();
                }
            });
        } else {
            background.run();
        }
    }
}
