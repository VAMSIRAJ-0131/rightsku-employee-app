package com.rightsku.employee_app;

public record LoginResponse(
    String token,
    String tokenType,
    Long userId,
    String loginId,
    String email,
    String role
) {
}