package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public record TimesheetResponse(
    Long id,
    LocalDate date,
    BigDecimal hours,
    String description,
    String status,
    Instant submittedAt
) {

    static TimesheetResponse from(TimesheetEntry e) {
        return new TimesheetResponse(
                e.getId(), e.getWorkDate(), e.getHours(), e.getDescription(), e.getStatus(), e.getCreatedAt());
    }
}
