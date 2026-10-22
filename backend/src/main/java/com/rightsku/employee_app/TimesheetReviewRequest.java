package com.rightsku.employee_app;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** HR decision for one employee's week: APPROVE or REJECT, with an optional note for the employee. */
public record TimesheetReviewRequest(

    @NotNull(message = "Choose the employee")
    Long employeeId,

    @NotNull(message = "Choose the week")
    LocalDate weekStart,

    @NotBlank(message = "Choose Approve or Reject")
    String decision,

    @Size(max = 500, message = "Note must be at most 500 characters")
    String note

) {
}
