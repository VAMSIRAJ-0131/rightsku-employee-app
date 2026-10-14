package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Password rules. Messages describe the rule only and never include the
 * password itself. Every password is stored only as a BCrypt hash.
 *
 * <ul>
 *   <li>{@link #employeeProblem}: the password an employee chooses for
 *       themselves (first sign-in and later changes) needs at least 8
 *       characters. Letters, numbers and special characters are all allowed.</li>
 *   <li>{@link #problem}: everything else keeps the longer rule, at least
 *       12 characters: HR Admin passwords and the temporary password HR gives
 *       a new employee.</li>
 * </ul>
 * Both rules refuse leading or trailing spaces and anything over 72 bytes
 * (BCrypt only uses the first 72 bytes).
 */
public final class PasswordPolicy {

    /** Minimum length of an employee's own password. */
    public static final int EMPLOYEE_MIN_LENGTH = 8;
    public static final String EMPLOYEE_RULE_MESSAGE = "Password must contain at least 8 characters.";

    public static final int MIN_LENGTH = 12;
    /** BCrypt only uses the first 72 bytes. */
    public static final int MAX_BYTES = 72;

    private PasswordPolicy() {
    }

    /** The rule for the password an employee sets for themselves: at least 8 characters. */
    public static Optional<String> employeeProblem(String password) {
        if (password == null || password.isBlank()
                || password.codePointCount(0, password.length()) < EMPLOYEE_MIN_LENGTH) {
            return Optional.of(EMPLOYEE_RULE_MESSAGE);
        }
        return commonProblem(password);
    }

    /** The rule that applies when this account holder chooses a new password. */
    public static Optional<String> problemForOwnPassword(String role, String password) {
        return AppUser.ROLE_EMPLOYEE.equals(role) ? employeeProblem(password) : problem(password);
    }

    /** Returns what is wrong with the password, or empty if it is acceptable (12+ character rule). */
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
        return commonProblem(password);
    }

    /** Checks shared by both rules. */
    private static Optional<String> commonProblem(String password) {
        if (!password.equals(password.strip())) {
            return Optional.of("Password must not start or end with spaces.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            return Optional.of("Password is too long (at most " + MAX_BYTES + " bytes).");
        }
        return Optional.empty();
    }
}
