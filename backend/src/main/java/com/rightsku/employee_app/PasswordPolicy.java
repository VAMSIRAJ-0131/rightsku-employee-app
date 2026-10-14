package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Password rules shared by every place that sets a password (HR Admin
 * bootstrap, employee creation). Messages describe the rule only and never
 * include the password itself.
 */
public final class PasswordPolicy {

    public static final int MIN_LENGTH = 12;
    /** BCrypt only uses the first 72 bytes. */
    public static final int MAX_BYTES = 72;

    private PasswordPolicy() {
    }

    /** Returns what is wrong with the password, or empty if it is acceptable. */
    public static Optional<String> problem(String password) {
        if (password == null || password.isBlank()) {
            return Optional.of("Password is required.");
        }
        if (!password.equals(password.strip())) {
            return Optional.of("Password must not start or end with spaces.");
        }
        if (password.length() < MIN_LENGTH) {
            return Optional.of("Password must be at least " + MIN_LENGTH + " characters.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            return Optional.of("Password is too long (at most " + MAX_BYTES + " bytes).");
        }
        return Optional.empty();
    }
}
