package com.rightsku.employee_app;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * HR: add (positive) or deduct (negative) Comp-Off days. requestKey is a unique
 * value the app makes for each change, so a change sent twice is applied once.
 */
public record CompOffAdjustmentRequest(

    @NotNull(message = "Enter the number of days")
    BigDecimal changeDays,

    @NotBlank(message = "Give a reason")
    @Size(max = 500, message = "Reason must be at most 500 characters")
    String reason,

    @NotBlank(message = "Missing change key")
    @Size(max = 64, message = "Change key is too long")
    String requestKey

) {
}
