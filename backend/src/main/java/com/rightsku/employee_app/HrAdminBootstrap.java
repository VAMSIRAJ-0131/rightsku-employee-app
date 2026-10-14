package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * One-time creation of the first HR Admin account.
 *
 * Disabled by default. It runs only when the environment variable
 * HR_ADMIN_BOOTSTRAP_ENABLED=true is set for that start of the app.
 * The password is read only from the environment variable
 * HR_ADMIN_BOOTSTRAP_PASSWORD; it is hashed with BCrypt and never logged.
 *
 * It never overwrites anything: if the account already exists, or any
 * HR Admin already exists, it does nothing.
 */
@Component
public class HrAdminBootstrap implements ApplicationRunner {

    public static final String ENABLED_VARIABLE = "HR_ADMIN_BOOTSTRAP_ENABLED";
    public static final String PASSWORD_VARIABLE = "HR_ADMIN_BOOTSTRAP_PASSWORD";
    public static final String EMAIL_PROPERTY = "app.bootstrap.hr-admin.email";

    static final int MIN_PASSWORD_LENGTH = PasswordPolicy.MIN_LENGTH;
    static final int MAX_PASSWORD_BYTES = PasswordPolicy.MAX_BYTES; // BCrypt limit

    private static final Logger log = LoggerFactory.getLogger(HrAdminBootstrap.class);

    private final Environment environment;
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;

    public HrAdminBootstrap(
            Environment environment,
            AppUserRepository appUserRepository,
            PasswordEncoder passwordEncoder) {
        this.environment = environment;
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!"true".equalsIgnoreCase(environment.getProperty(ENABLED_VARIABLE, "false").trim())) {
            return; // Off by default: nothing to do.
        }

        String email = environment.getProperty(EMAIL_PROPERTY, "").trim().toLowerCase(Locale.ROOT);
        if (email.isEmpty() || !email.contains("@")) {
            throw new IllegalStateException(
                    "HR Admin bootstrap: " + EMAIL_PROPERTY + " is not a valid email address.");
        }

        if (appUserRepository.existsByEmailIgnoreCase(email)) {
            log.warn("HR Admin bootstrap: an account for {} already exists. Nothing was changed. "
                    + "Remove {} and {} now.", email, ENABLED_VARIABLE, PASSWORD_VARIABLE);
            return;
        }
        if (appUserRepository.existsByRole(AppUser.ROLE_HR_ADMIN)) {
            log.warn("HR Admin bootstrap: an HR Admin account already exists. Nothing was changed. "
                    + "Remove {} and {} now.", ENABLED_VARIABLE, PASSWORD_VARIABLE);
            return;
        }

        String password = environment.getProperty(PASSWORD_VARIABLE);
        validatePassword(password);

        appUserRepository.save(AppUser.create(
                email, passwordEncoder.encode(password), AppUser.ROLE_HR_ADMIN));

        log.info("HR Admin bootstrap: created the HR Admin account for {}. "
                + "Stop the app and remove {} and {} before the next start.",
                email, ENABLED_VARIABLE, PASSWORD_VARIABLE);
    }

    /** Messages describe the rule only; the password itself is never included. */
    static void validatePassword(String password) {
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("HR Admin bootstrap is enabled but "
                    + PASSWORD_VARIABLE + " is not set.");
        }
        if (!password.equals(password.strip())) {
            throw new IllegalStateException("HR Admin bootstrap: the password must not start or end with spaces.");
        }
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalStateException("HR Admin bootstrap: the password must be at least "
                    + MIN_PASSWORD_LENGTH + " characters.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new IllegalStateException("HR Admin bootstrap: the password must be at most "
                    + MAX_PASSWORD_BYTES + " bytes.");
        }
    }
}
