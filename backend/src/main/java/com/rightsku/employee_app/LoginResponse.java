package com.rightsku.employee_app;

public record LoginResponse(
    String token,
    String tokenType,
    Long userId,
    String loginId,
    String email,
    String role,
    /** True while the account has a temporary password: the app must ask for a new one first. */
    boolean mustChangePassword
) {
}