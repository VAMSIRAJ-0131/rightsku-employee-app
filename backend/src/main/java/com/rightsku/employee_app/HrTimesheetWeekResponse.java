package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * One employee's week in the HR review list: who, which week, total hours,
 * when it was sent, its status and the days themselves.
 */
public record HrTimesheetWeekResponse(
    long employeeId,
    String employeeCode,
    String employeeName,
    LocalDate weekStart,
    LocalDate weekEnd,
    BigDecimal totalHours,
    Instant submittedAt,
    String status,
    Instant reviewedAt,
    String reviewNote,
    List<TimesheetResponse> days
) {
}
