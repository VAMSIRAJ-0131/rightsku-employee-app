package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** "Forgot password" step 1: the Employee ID, or the work email for HR Admins. */
public record PasswordResetRequest(

    @NotBlank(message = "Enter your Employee ID")
    @Size(max = 254, message = "This ID is too long")
    String username

) {
}
