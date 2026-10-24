package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** One Comp-Off request, for the employee's own list and HR's approvals. */
public record CompOffRequestResponse(
    long id,
    long employeeId,
    String employeeCode,
    String employeeName,
    LocalDate workDate,
    /** WEEKLY_OFF or HOLIDAY: why the day was not a working day. */
    String dayKind,
    String holidayName,
    BigDecimal days,
    String reason,
    String status,
    Instant submittedAt,
    Instant reviewedAt,
    String reviewNote
) {

    static CompOffRequestResponse from(CompOffRequest r, Employee e, WorkCalendar.Day day) {
        return new CompOffRequestResponse(r.getId(), r.getEmployeeId(),
                e == null ? null : e.getEmployeeCode(),
                e == null ? null : (e.getFirstName() + " " + e.getLastName()).trim(),
                r.getWorkDate(),
                day == null ? null : day.kind().name(),
                day == null ? null : day.holidayName(),
                r.getDays(), r.getReason(), r.getStatus(), r.getCreatedAt(), r.getReviewedAt(), r.getReviewNote());
    }
}
