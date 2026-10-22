package com.rightsku.employee_app;

import java.time.LocalDate;
import java.util.List;

/**
 * Where the timesheet gets an employee's leave from.
 *
 * The implementation is {@link LeaveRequestLeaveDays}, which reads the
 * employee's leave requests. Only APPROVED leave ever reduces the weekly
 * target; pending and rejected leave are ignored.
 */
public interface LeaveDays {

    enum Portion { FULL_DAY, HALF_DAY }

    enum Status { PENDING, APPROVED, REJECTED }

    /** One day of leave. A leave of several days is one record per day. */
    record LeaveDay(LocalDate date, Portion portion, Status status) {
    }

    /** All of the employee's leave days between from and to (both included), any status. */
    List<LeaveDay> leaveBetween(long employeeId, LocalDate from, LocalDate to);
}
