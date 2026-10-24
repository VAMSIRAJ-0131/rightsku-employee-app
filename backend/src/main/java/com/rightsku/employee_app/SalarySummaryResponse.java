package com.rightsku.employee_app;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Monthly salary summary for HR (see SalarySummaryService for the rules).
 * Every count is in whole days: leave requests and timesheets are whole days.
 */
public record SalarySummaryResponse(
    int year,
    int month,
    LocalDate from,
    LocalDate to,
    int daysInMonth,
    /** True while the month is not over: days after asOf are not judged yet. */
    boolean provisional,
    LocalDate asOf,
    Instant generatedAt,
    List<Row> rows,
    Totals totals
) {

    public record Row(
        int serialNo,
        long employeeId,
        String employeeCode,
        String employeeName,
        String employmentStatus,
        LocalDate joiningDate,
        /** Calendar days in the month on which the person was employed (from the joining date). */
        int employedDays,
        int workingDays,
        int presentDays,
        int paidLeaveDays,
        /** Approved unpaid leave. The app has no unpaid leave type yet, so this is 0. */
        int unpaidLeaveDays,
        int holidays,
        int weeklyOffs,
        /** LOP absences: 0-hour working days (no paid leave left) in weeks HR approved. */
        int absences,
        /** Working days still waiting for HR to approve a timesheet or leave: not judged yet, never LOP. */
        int pendingDays,
        /** Working days HR must look at (no timesheet submitted, rejected): not counted as LOP. */
        int reviewDays,
        /** Working days after asOf (only in a month that is not over). */
        int notYetDue,
        int lopDays,
        int payableDays,
        /** True when the month is over and nothing is pending or needs review: ready for payroll. */
        boolean complete,
        List<String> flags
    ) {
    }

    public record Totals(
        int employees,
        int presentDays,
        int paidLeaveDays,
        int unpaidLeaveDays,
        int absences,
        int pendingDays,
        int reviewDays,
        int lopDays,
        int payableDays,
        int needsReview
    ) {
    }
}
