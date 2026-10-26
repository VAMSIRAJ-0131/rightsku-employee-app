package com.rightsku.employee_app;

import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * The personal details an employee can ask HR to change (V19), each with its
 * JSON key, label and rule. A value is cleaned the same way when it is asked
 * for and when HR's approval saves it, so only valid values are ever stored.
 * An empty value removes the detail.
 */
public enum ProfileField {

    PHONE("phone", "Phone", 30, Employee::getPhone),
    ADDRESS("address", "Address", 300, Employee::getAddress),
    EMERGENCY_CONTACT_NAME("emergencyContactName", "Emergency contact name", 100, Employee::getEmergencyContactName),
    EMERGENCY_CONTACT_PHONE("emergencyContactPhone", "Emergency contact phone", 20, Employee::getEmergencyContactPhone),
    BANK_ACCOUNT_NAME("bankAccountName", "Bank account holder name", 100, Employee::getBankAccountName),
    BANK_ACCOUNT_NUMBER("bankAccountNumber", "Bank account number", 18, Employee::getBankAccountNumber),
    BANK_IFSC("bankIfsc", "IFSC code", 11, Employee::getBankIfsc);

    private static final Pattern PHONE_CHARS = Pattern.compile("^[0-9+()\\-\\s]*$");
    private static final Pattern DIGITS = Pattern.compile("[0-9]");
    private static final Pattern ACCOUNT = Pattern.compile("^[0-9]{9,18}$");
    private static final Pattern IFSC = Pattern.compile("^[A-Z]{4}0[A-Z0-9]{6}$");

    private final String key;
    private final String label;
    private final int maxLength;
    private final Function<Employee, String> current;

    ProfileField(String key, String label, int maxLength, Function<Employee, String> current) {
        this.key = key;
        this.label = label;
        this.maxLength = maxLength;
        this.current = current;
    }

    public String key() {
        return key;
    }

    public String label() {
        return label;
    }

    /** The employee's value now (null when not set). */
    public String currentValue(Employee employee) {
        return current.apply(employee);
    }

    /** The bank account number is shown masked to the employee ("•••• 4321"). */
    public boolean sensitive() {
        return this == BANK_ACCOUNT_NUMBER;
    }

    public static Optional<ProfileField> byKey(String key) {
        for (ProfileField f : values()) {
            if (f.key.equals(key)) {
                return Optional.of(f);
            }
        }
        return Optional.empty();
    }

    /**
     * The cleaned value to store (null = remove the detail), or an
     * ApiException naming the field when it is not valid.
     */
    public String clean(String raw) {
        String value = raw == null ? "" : raw.replaceAll("\\p{Cntrl}", " ").strip().replaceAll("\\s{2,}", " ");
        if (value.isEmpty()) {
            return null;
        }
        if (this == BANK_ACCOUNT_NUMBER) {
            value = value.replaceAll("[\\s-]", "");
        }
        if (this == BANK_IFSC) {
            value = value.replaceAll("\\s", "").toUpperCase(Locale.ROOT);
        }
        if (value.length() > maxLength) {
            throw ApiException.invalid(key, label + " must be at most " + maxLength + " characters.");
        }
        switch (this) {
            case PHONE, EMERGENCY_CONTACT_PHONE -> {
                long digits = DIGITS.matcher(value).results().count();
                if (!PHONE_CHARS.matcher(value).matches() || digits < 10 || digits > 15) {
                    throw ApiException.invalid(key, "Enter a valid phone number (10 to 15 digits).");
                }
            }
            case BANK_ACCOUNT_NUMBER -> {
                if (!ACCOUNT.matcher(value).matches()) {
                    throw ApiException.invalid(key, "Bank account number must be 9 to 18 digits.");
                }
            }
            case BANK_IFSC -> {
                if (!IFSC.matcher(value).matches()) {
                    throw ApiException.invalid(key, "Enter a valid IFSC code, like SBIN0001234.");
                }
            }
            default -> {
                if (value.length() < 2) {
                    throw ApiException.invalid(key, label + " is too short.");
                }
            }
        }
        return value;
    }

    /** "•••• 4321" for an account number; other values as they are. */
    public static String mask(String accountNumber) {
        if (accountNumber == null || accountNumber.length() < 4) {
            return accountNumber;
        }
        return "•••• " + accountNumber.substring(accountNumber.length() - 4);
    }
}
