package com.rightsku.employee_app;

import org.springframework.http.HttpStatus;

/**
 * An error with a known HTTP status and a safe, user-facing message.
 * {@code field} names the request field the message belongs to, if any.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String field;

    private ApiException(HttpStatus status, String field, String message) {
        super(message);
        this.status = status;
        this.field = field;
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, null, message);
    }

    /** 409: the value is already used (e.g. Employee ID or email). */
    public static ApiException conflict(String field, String message) {
        return new ApiException(HttpStatus.CONFLICT, field, message);
    }

    /** 400: the value is not acceptable. */
    public static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, field, message);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getField() {
        return field;
    }
}
