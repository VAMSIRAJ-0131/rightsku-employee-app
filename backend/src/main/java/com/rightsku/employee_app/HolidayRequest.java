package com.rightsku.employee_app;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A company holiday, added or changed by HR. */
public record HolidayRequest(

    @NotNull(message = "Choose the holiday date")
    LocalDate date,

    @NotBlank(message = "Enter the holiday name")
    @Size(max = 100, message = "Holiday name must be at most 100 characters")
    String name

) {
}
