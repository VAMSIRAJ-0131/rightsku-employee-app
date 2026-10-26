package com.rightsku.employee_app;

import java.time.Instant;
import java.util.List;

/**
 * A personal details change request, with each asked-for field's value
 * before and the value asked for. The employee sees the bank account number
 * masked; HR sees it in full (HR needs it for salaries).
 */
public record ProfileChangeResponse(
    long id,
    long employeeId,
    String employeeCode,
    String employeeName,
    String status,
    Instant createdAt,
    Instant reviewedAt,
    String reviewNote,
    Instant cancelledAt,
    List<Item> items
) {

    public record Item(String key, String label, String previous, String requested) {
    }
}
