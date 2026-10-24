package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * One week of the signed-in employee's timesheet, with the target worked out
 * by the server.
 *
 * <ul>
 *   <li>status: NOT_STARTED (nothing saved yet), DRAFT, SUBMITTED, or
 *       ALREADY_SUBMITTED (every working day was already submitted one day at
 *       a time; there is nothing left to save or submit).</li>
 *   <li>Each day: kind WORKING / WEEKLY_OFF / HOLIDAY, the approved leave on
 *       it (FULL_DAY / HALF_DAY or null), hours (saved draft or submitted
 *       entry), entryStatus (PENDING / APPROVED / REJECTED once submitted)
 *       and editable (whether hours can still be entered).</li>
 *   <li>target: scheduled hours, minus holidays and approved leave, gives the
 *       expected hours. enteredHours counts only hours worked (submitted
 *       entries that were not rejected, plus this week's draft); leave is
 *       never added to it.</li>
 *   <li>canSubmit is false with submitBlockedReason saying why (for example
 *       hours still missing, or the week not finished yet).</li>
 *   <li>Empty working days (see WeekSubmission): pendingLeave says a leave
 *       request for the day is waiting for HR; emptyMeaning is LOP,
 *       PENDING_LEAVE or NEEDS_LEAVE for a working day with no hours.
 *       target.requiredHours is the total that must be entered exactly (the
 *       expected hours minus empty LOP and pending-leave days), and
 *       paidLeaveAvailable says whether an empty day would need leave.</li>
 * </ul>
 */
public record WeekTimesheetResponse(
    LocalDate weekStart,
    LocalDate weekEnd,
    LocalDate today,
    String status,
    String description,
    Instant savedAt,
    Instant submittedAt,
    List<Day> days,
    Target target,
    LocalDate submitOpensOn,
    boolean canSubmit,
    String submitBlockedReason,
    boolean paidLeaveAvailable
) {

    public record Day(
        LocalDate date,
        String kind,
        boolean weeklyOff,
        String holidayName,
        boolean beforeJoining,
        String leave,
        BigDecimal scheduledHours,
        BigDecimal targetHours,
        BigDecimal hours,
        String entryStatus,
        boolean editable,
        boolean pendingLeave,
        String emptyMeaning
    ) {
    }

    public record Target(
        BigDecimal scheduledHours,
        BigDecimal holidayHours,
        BigDecimal leaveHours,
        BigDecimal expectedHours,
        BigDecimal enteredHours,
        BigDecimal remainingHours,
        BigDecimal requiredHours,
        long lopDays
    ) {
    }
}
