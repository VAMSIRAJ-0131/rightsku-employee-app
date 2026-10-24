package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/** The signed-in employee asks for Comp-Off for a day they worked on a weekly off or holiday. */
public record CompOffApplyRequest(

    @NotNull(message = "Choose the day you worked")
    LocalDate workDate,

    /** 1 (full day) or 0.5 (half day). */
    @NotNull(message = "Choose full day or half day")
    BigDecimal days,

    @NotBlank(message = "Describe the work you did")
    @Size(max = 500, message = "Description must be at most 500 characters")
    String reason

) {
}
