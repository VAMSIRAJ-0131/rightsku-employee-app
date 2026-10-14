package com.rightsku.employee_app;

import java.time.Instant;

/** A document's details as returned by the API. Never contains the file itself. */
public record DocumentResponse(
    Long id,
    Long employeeId,
    String employeeCode,
    String employeeName,
    String type,
    String typeLabel,
    String period,
    String title,
    String fileName,
    String contentType,
    long sizeBytes,
    int version,
    Instant uploadedAt,
    Instant updatedAt
) {

    static DocumentResponse from(EmployeeDocument d) {
        Employee e = d.getEmployee();
        return new DocumentResponse(
                d.getId(),
                e.getId(),
                e.getEmployeeCode(),
                (e.getFirstName() + " " + e.getLastName()).trim(),
                d.getType().name(),
                d.getType().label(),
                d.getPeriod(),
                d.getTitle(),
                d.getFileName(),
                d.getContentType(),
                d.getSizeBytes(),
                d.getVersion(),
                d.getCreatedAt(),
                d.getUpdatedAt());
    }
}
