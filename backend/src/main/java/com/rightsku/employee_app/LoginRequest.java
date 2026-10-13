package com.rightsku.employee_app;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(

    @NotBlank(message = "Email is required")
    @Email(message = "Enter a valid email address")
    @Size(max = 254)
    String email,

    @NotBlank(message = "Password is required")
    @Size(max = 72, message = "Password is too long")
    String password

) {
}