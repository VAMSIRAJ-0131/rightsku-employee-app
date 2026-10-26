package com.rightsku.employee_app;

import java.time.Month;
import java.time.format.TextStyle;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The kinds of employee documents HR can upload, and the "period" each one
 * needs: a payslip belongs to a month (2026-09), a Form 16 to a financial
 * year (2025-26), an appraisal (compensation) letter to a calendar year (2026);
 * the offer and experience letters have no period.
 */
public enum DocumentType {

    OFFER_LETTER("Offer letter"),
    EXPERIENCE_LETTER("Experience letter"),
    PAYSLIP("Payslip"),
    FORM_16("Form 16"),
    COMPENSATION_LETTER("Appraisal letter");

    private static final Pattern MONTH = Pattern.compile("^(\\d{4})-(\\d{2})$");
    private static final Pattern FINANCIAL_YEAR = Pattern.compile("^(\\d{4})-(\\d{2})$");
    private static final Pattern YEAR = Pattern.compile("^(\\d{4})$");

    private final String label;

    DocumentType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static Optional<DocumentType> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(value.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    /**
     * Checks the period for this type and returns it in stored form (null for
     * letters). Throws IllegalArgumentException with a plain message.
     */
    public String normalizePeriod(String period) {
        String value = period == null ? "" : period.trim();
        switch (this) {
            case PAYSLIP -> {
                Matcher m = MONTH.matcher(value);
                if (!m.matches()) {
                    throw new IllegalArgumentException("Choose the payslip month.");
                }
                int year = Integer.parseInt(m.group(1));
                int month = Integer.parseInt(m.group(2));
                if (year < 2000 || year > 2100 || month < 1 || month > 12) {
                    throw new IllegalArgumentException("Choose a valid payslip month.");
                }
                return value;
            }
            case FORM_16 -> {
                Matcher m = FINANCIAL_YEAR.matcher(value);
                if (!m.matches()) {
                    throw new IllegalArgumentException("Enter the financial year, like 2025-26.");
                }
                int start = Integer.parseInt(m.group(1));
                int end = Integer.parseInt(m.group(2));
                if (start < 2000 || start > 2100 || end != (start + 1) % 100) {
                    throw new IllegalArgumentException("Enter the financial year, like 2025-26.");
                }
                return value;
            }
            case COMPENSATION_LETTER -> {
                Matcher m = YEAR.matcher(value);
                if (!m.matches()) {
                    throw new IllegalArgumentException("Choose the year of the appraisal letter, like 2026.");
                }
                int year = Integer.parseInt(m.group(1));
                if (year < 2000 || year > 2100) {
                    throw new IllegalArgumentException("Choose a valid year.");
                }
                return value;
            }
            default -> {
                if (!value.isEmpty()) {
                    throw new IllegalArgumentException(label + "s don't have a month or year.");
                }
                return null;
            }
        }
    }

    /** Title used when HR leaves the title empty, e.g. "Payslip - September 2026". */
    public String defaultTitle(String period) {
        return switch (this) {
            case PAYSLIP -> {
                Month month = Month.of(Integer.parseInt(period.substring(5, 7)));
                yield label + " - " + month.getDisplayName(TextStyle.FULL, Locale.ENGLISH) + " " + period.substring(0, 4);
            }
            case FORM_16 -> label + " - FY " + period;
            case COMPENSATION_LETTER -> label + " - " + period;
            default -> label;
        };
    }
}
