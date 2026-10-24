package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * One employee's week in the HR review list: who, which week, total hours,
 * when it was sent, its status and the days themselves. zeroHourDays are the
 * past working days of the week left at 0 hours with no leave on them: the
 * employee had no paid leave left, so approving the week makes them LOP.
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
    List<TimesheetResponse> days,
    List<LocalDate> zeroHourDays
) {
}
