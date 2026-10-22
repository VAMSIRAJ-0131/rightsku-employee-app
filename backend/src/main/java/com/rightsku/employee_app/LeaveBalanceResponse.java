package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One leave type for one employee. balanceDays is set by HR and goes down
 * when a request is approved; pendingDays are waiting for HR; availableDays
 * (balance minus pending) is what a new request can use.
 */
public record LeaveBalanceResponse(
    String leaveType,
    String label,
    BigDecimal balanceDays,
    BigDecimal pendingDays,
    BigDecimal availableDays,
    Instant updatedAt
) {
}
