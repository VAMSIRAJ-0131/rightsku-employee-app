package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Sent by a signed-in user to replace their password. Neither value is ever
 * stored as text, logged or returned. The full password rules are checked in
 * PasswordChangeService (PasswordPolicy).
 */
public record ChangePasswordRequest(

    @NotBlank(message = "Enter your current password")
    @Size(max = 72, message = "Current password is too long")
    String currentPassword,

    @NotBlank(message = "Enter a new password")
    @Size(max = 72, message = "New password is too long")
    String newPassword

) {
}
