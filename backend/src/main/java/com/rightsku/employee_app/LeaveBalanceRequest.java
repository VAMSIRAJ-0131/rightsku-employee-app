package com.rightsku.employee_app;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotNull;

/** HR: the new balance for one leave type, in days (0 to 365, in half days). */
public record LeaveBalanceRequest(

    @NotNull(message = "Enter the balance in days")
    BigDecimal balanceDays

) {
}
