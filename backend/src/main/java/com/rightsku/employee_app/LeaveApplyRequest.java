package com.rightsku.employee_app;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A leave application from the signed-in employee. */
public record LeaveApplyRequest(

    @NotBlank(message = "Choose the leave type")
    String leaveType,

    @NotNull(message = "Choose the first day")
    LocalDate startDate,

    @NotNull(message = "Choose the last day")
    LocalDate endDate,

    @NotBlank(message = "Give a reason")
    @Size(max = 500, message = "Reason must be at most 500 characters")
    String reason

) {
}
