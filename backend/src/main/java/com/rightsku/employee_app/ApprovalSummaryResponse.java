package com.rightsku.employee_app;

/**
 * Counts for the HR home screen and Approvals tabs, always from the database.
 * Timesheets are counted per employee-week (a week with pending days counts once).
 */
public record ApprovalSummaryResponse(Counts timesheets, Counts leave) {

    public record Counts(long pending, long approved, long rejected) {
    }
}
