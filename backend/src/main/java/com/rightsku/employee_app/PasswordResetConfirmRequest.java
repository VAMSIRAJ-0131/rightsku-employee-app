package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * "Forgot password" step 2: the emailed code and the new password. No value
 * is ever stored as text, logged or returned. The code, the password rules
 * and that both passwords match are checked in PasswordResetService.
 */
public record PasswordResetConfirmRequest(

    @NotBlank(message = "Enter your Employee ID")
    @Size(max = 254, message = "This ID is too long")
    String username,

    @NotBlank(message = "Enter the 6-digit code from the email")
    @Size(max = 12, message = "Enter the 6-digit code from the email")
    String code,

    @NotBlank(message = "Enter a new password")
    @Size(max = 72, message = "New password is too long")
    String newPassword,

    @NotBlank(message = "Enter the new password again")
    @Size(max = 72, message = "New password is too long")
    String confirmPassword

) {
}
