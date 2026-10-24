package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Sent by an HR Admin to reset a forgotten employee password. The temporary
 * password is hashed with BCrypt and never stored as text, returned or
 * logged. The rules (PasswordPolicy, 12+ characters) and that both fields
 * match are checked in EmployeeService.
 */
public record HrPasswordResetRequest(

    @NotBlank(message = "Enter a temporary password")
    @Size(max = 72, message = "Temporary password is too long")
    String temporaryPassword,

    @NotBlank(message = "Enter the temporary password again")
    @Size(max = 72, message = "Temporary password is too long")
    String confirmPassword

) {
}
