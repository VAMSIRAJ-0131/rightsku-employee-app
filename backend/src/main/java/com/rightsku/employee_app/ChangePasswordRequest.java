package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Sent by a signed-in user to replace their password. No value is ever stored
 * as text, logged or returned. The password rules (PasswordPolicy) and that
 * both new passwords match are checked in PasswordChangeService.
 */
public record ChangePasswordRequest(

    @NotBlank(message = "Enter your current password")
    @Size(max = 72, message = "Current password is too long")
    String currentPassword,

    @NotBlank(message = "Enter a new password")
    @Size(max = 72, message = "New password is too long")
    String newPassword,

    @NotBlank(message = "Enter the new password again")
    @Size(max = 72, message = "New password is too long")
    String confirmPassword

) {
}
