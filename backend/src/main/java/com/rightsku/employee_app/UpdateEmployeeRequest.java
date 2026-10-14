package com.rightsku.employee_app;

import java.time.LocalDate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Editable employee details. The Employee ID and password are not changed here. */
public record UpdateEmployeeRequest(

    @NotBlank(message = "First name is required")
    @Size(max = 100, message = "First name must be at most 100 characters")
    String firstName,

    @NotBlank(message = "Last name is required")
    @Size(max = 100, message = "Last name must be at most 100 characters")
    String lastName,

    @NotBlank(message = "Email is required")
    @Email(message = "Enter a valid email address")
    @Size(max = 254, message = "Email must be at most 254 characters")
    String email,

    @Size(max = 30, message = "Phone must be at most 30 characters")
    @Pattern(regexp = "^[0-9+()\\-\\s]*$", message = "Phone can contain digits, spaces, +, -, ( and ) only")
    String phone,

    @Size(max = 100, message = "Department must be at most 100 characters")
    String department,

    @Size(max = 100, message = "Job title must be at most 100 characters")
    String jobTitle,

    LocalDate joiningDate

) {
}
