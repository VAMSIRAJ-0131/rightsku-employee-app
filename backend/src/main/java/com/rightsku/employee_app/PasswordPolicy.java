package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Password rules. Messages describe the rule only and never include the
 * password itself. Every password is stored only as a BCrypt hash.
 *
 * <ul>
 *   <li>{@link #employeeProblem}: the password an employee chooses for
 *       themselves (first sign-in and later changes) must be exactly 8 digits
 *       (0-9).</li>
 *   <li>{@link #problem}: everything else keeps the longer rule, at least
 *       12 characters: HR Admin passwords and the temporary password HR gives
 *       a new employee.</li>
 * </ul>
 */
public final class PasswordPolicy {

    /** Length of an employee's own password (digits only). */
    public static final int EMPLOYEE_DIGITS = 8;
    public static final String EMPLOYEE_RULE_MESSAGE = "Password must contain exactly 8 digits.";
    /** ASCII digits only: no letters, symbols, spaces or other scripts' digits. */
    private static final Pattern EMPLOYEE_PASSWORD = Pattern.compile("^[0-9]{" + EMPLOYEE_DIGITS + "}$");

    public static final int MIN_LENGTH = 12;
    /** BCrypt only uses the first 72 bytes. */
    public static final int MAX_BYTES = 72;

    private PasswordPolicy() {
    }

    /** The rule for the password an employee sets for themselves: exactly 8 digits. */
    public static Optional<String> employeeProblem(String password) {
        if (password == null || !EMPLOYEE_PASSWORD.matcher(password).matches()) {
            return Optional.of(EMPLOYEE_RULE_MESSAGE);
        }
        return Optional.empty();
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
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            return Optional.of("Password is too long (at most " + MAX_BYTES + " bytes).");
        }
        return Optional.empty();
    }
}
