package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A week of hours from the signed-in employee, for "Save" (draft) or
 * "Submit for approval". Days left out, or sent without hours, are empty.
 * The description is optional for a draft and required to submit.
 */
public record WeekTimesheetRequest(

    @NotNull(message = "Choose the week")
    LocalDate weekStart,

    @Size(max = 500, message = "Description must be at most 500 characters")
    String description,

    @Valid
    @NotNull(message = "Send the days of the week")
    @Size(max = 7, message = "A week has at most 7 days")
    List<DayHours> days

) {

    public record DayHours(
        @NotNull(message = "Choose the date")
        LocalDate date,
        BigDecimal hours
    ) {
    }
}
