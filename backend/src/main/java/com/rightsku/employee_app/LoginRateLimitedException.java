package com.rightsku.employee_app;

import java.time.Duration;

/** Thrown when too many sign-in attempts failed; answered with HTTP 429. */
public class LoginRateLimitedException extends RuntimeException {

    private final Duration retryAfter;

    public LoginRateLimitedException(Duration retryAfter) {
        super("Too many sign-in attempts");
        this.retryAfter = retryAfter;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
