package com.rightsku.employee_app;

/**
 * Counts for the HR home screen and Approvals tabs, always from the database.
 * Timesheets are counted per employee-week (a week with pending days counts once).
 */
public record ApprovalSummaryResponse(Counts timesheets, Counts leave, Counts compOff) {

    /** Timesheets and leave only; Comp-Off requests are added by the controller. */
    public ApprovalSummaryResponse(Counts timesheets, Counts leave) {
        this(timesheets, leave, new Counts(0, 0, 0));
    }

    ApprovalSummaryResponse withCompOff(Counts compOffCounts) {
        return new ApprovalSummaryResponse(timesheets, leave, compOffCounts);
    }

    public record Counts(long pending, long approved, long rejected) {
    }
}
