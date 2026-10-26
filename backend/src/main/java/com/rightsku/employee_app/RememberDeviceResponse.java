package com.rightsku.employee_app;

/**
 * Answer of POST /api/auth/remember-device: the token the phone keeps
 * encrypted to stay signed in. Shown once; the server stores only its hash.
 */
public record RememberDeviceResponse(String refreshToken) {
}
