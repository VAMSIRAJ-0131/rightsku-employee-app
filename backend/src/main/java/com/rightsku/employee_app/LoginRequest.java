package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(

    /** Employee ID for employees (e.g. EMP001), or work email for HR Admins. */
    @NotBlank(message = "Employee ID is required")
    @Size(max = 254, message = "Employee ID is too long")
    String username,

    @NotBlank(message = "Password is required")
    @Size(max = 72, message = "Password is too long")
    String password

) {
}
