package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of POST /api/auth/refresh and /api/auth/logout. */
public record RefreshTokenRequest(
    @NotBlank(message = "Refresh token is required")
    @Size(max = RefreshTokenService.MAX_TOKEN_LENGTH, message = "Refresh token is too long")
    String refreshToken
) {
}
