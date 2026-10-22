package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.util.List;

/**
 * An employee's Comp-Off balance: balanceDays (goes down only when HR approves),
 * pendingDays (requested, waiting for HR), availableDays (what a new request can
 * use), and the change history, newest first.
 */
public record CompOffResponse(
    long employeeId,
    BigDecimal balanceDays,
    BigDecimal pendingDays,
    BigDecimal availableDays,
    List<CompOffAdjustmentResponse> history
) {
}
