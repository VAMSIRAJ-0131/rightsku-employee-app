package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** One day's timesheet, sent by the signed-in employee. */
public record TimesheetRequest(

    @NotNull(message = "Choose the date")
    LocalDate date,

    @NotNull(message = "Enter the hours worked")
    BigDecimal hours,

    @NotBlank(message = "Describe the work done")
    @Size(max = 500, message = "Description must be at most 500 characters")
    String description

) {
}
