package com.rightsku.employee_app;

/**
 * Whether an employee could still take at least one day of paid leave of any
 * type (balance minus leave already waiting for approval). Used when a
 * timesheet week is submitted: an empty working day is LOP only if no paid
 * leave is left. See {@link WeekSubmission}.
 */
@FunctionalInterface
public interface PaidLeaveCheck {

    boolean hasPaidLeaveAvailable(long employeeId);
}
