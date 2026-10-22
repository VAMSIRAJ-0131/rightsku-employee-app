package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public record LeaveRequestResponse(
    long id,
    long employeeId,
    String employeeCode,
    String employeeName,
    String leaveType,
    String label,
    LocalDate startDate,
    LocalDate endDate,
    BigDecimal days,
    String reason,
    String status,
    Instant submittedAt,
    Instant reviewedAt,
    String reviewNote
) {

    static LeaveRequestResponse from(LeaveRequest r, Employee e) {
        LeaveType type = LeaveType.valueOf(r.getLeaveType());
        return new LeaveRequestResponse(r.getId(), r.getEmployeeId(),
                e == null ? null : e.getEmployeeCode(),
                e == null ? null : (e.getFirstName() + " " + e.getLastName()).trim(),
                type.name(), type.label(), r.getStartDate(), r.getEndDate(), r.getDays(), r.getReason(),
                r.getStatus(), r.getCreatedAt(), r.getReviewedAt(), r.getReviewNote());
    }
}
