package com.rightsku.employee_app;

import java.util.Locale;

/**
 * The leave types the app supports. Casual, Sick and Earned balances are set by
 * HR directly; the Comp-Off balance changes only through recorded adjustments
 * (each with a reason) and approved Comp-Off requests (see CompOffService).
 */
public enum LeaveType {
    CASUAL("Casual"),
    SICK("Sick"),
    EARNED("Earned"),
    COMP_OFF("Comp-Off");

    private final String label;

    LeaveType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** True when every balance change must be recorded with a reason (Comp-Off). */
    public boolean usesAdjustmentHistory() {
        return this == COMP_OFF;
    }

    /** "casual" / "Casual" / "CASUAL" -> CASUAL; anything else is a 400 on the given field. */
    static LeaveType parse(String value, String field) {
        if (value != null) {
            for (LeaveType t : values()) {
                if (t.name().equals(value.trim().toUpperCase(Locale.ROOT))) {
                    return t;
                }
            }
        }
        throw ApiException.invalid(field, "Choose Casual, Sick, Earned or Comp-Off leave.");
    }
}
