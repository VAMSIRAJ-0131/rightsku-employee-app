package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * HR sets an employee's working schedule from a date.
 * weeklyOffs: day names (MONDAY ... SUNDAY); at least one working day must remain.
 */
public record ScheduleRequest(

    @NotNull(message = "Choose the weekly off days (or none)")
    @Size(max = 7, message = "Choose at most 6 weekly off days")
    List<String> weeklyOffs,

    @NotNull(message = "Enter the working hours per day")
    BigDecimal hoursPerDay,

    @NotNull(message = "Choose the date this schedule starts")
    LocalDate effectiveFrom

) {
}
