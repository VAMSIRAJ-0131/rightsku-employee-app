package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Whether a timesheet week may be submitted, and what its empty working days
 * mean. Plain Java (no Spring or database) so every rule is easy to test; the
 * app applies the same rules to show them while typing, but this is what the
 * server enforces.
 *
 * <p>Starting from the week's target ({@link WeekTarget}: scheduled hours,
 * minus holidays and APPROVED leave, from the joining date), each working day
 * that is still open is either <b>blank</b> (nothing entered yet: UNFILLED,
 * which blocks submitting, unless its leave is waiting for HR) or has
 * <b>0 hours</b> entered ("I did not work"), which is one of:
 * <ul>
 *   <li><b>PENDING_LEAVE</b>: a leave request for that day is waiting for HR.
 *       The day leaves the week's total; it is not LOP while HR decides.</li>
 *   <li><b>LOP</b>: no paid leave of any type is available. The employee can't
 *       cover the day with leave, so it is Loss of Pay. The day leaves the
 *       week's total.</li>
 *   <li><b>NEEDS_LEAVE</b>: paid leave is still available, so the week can't
 *       be submitted until the employee applies for leave for that day or
 *       enters hours.</li>
 * </ul>
 * Approved leave counts toward the week: hours worked plus approved leave
 * must <b>exactly</b> match the week's hours (45 for five 9-hour days, less
 * holidays and the LOP / pending-leave days above). Example: 9 h worked and
 * 27 h approved leave leave 9 h to enter. Days already submitted one at a time
 * count as worked (rejected ones don't). Leave is shown as leave, never stored
 * as hours worked.
 */
public final class WeekSubmission {

    public enum Empty { LOP, PENDING_LEAVE, NEEDS_LEAVE, UNFILLED }

    public record EmptyDay(LocalDate date, Empty meaning, BigDecimal hours) {
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private final List<EmptyDay> emptyDays;
    private final BigDecimal requiredHours;
    private final BigDecimal enteredHours;
    private final BigDecimal leaveHours;
    private final String problem;

    private WeekSubmission(List<EmptyDay> emptyDays, BigDecimal requiredHours, BigDecimal enteredHours,
            BigDecimal leaveHours, String problem) {
        this.emptyDays = List.copyOf(emptyDays);
        this.requiredHours = requiredHours;
        this.enteredHours = enteredHours;
        this.leaveHours = leaveHours;
        this.problem = problem;
    }

    /**
     * @param target the week's target
     * @param hours hours being submitted now, per day: 0 for a day not worked; blank days are left out
     * @param submittedDates days that already have a submitted entry (any status)
     * @param lockedHours hours of those entries that count as worked (not rejected)
     * @param pendingLeaveDates days with leave waiting for HR
     * @param paidLeaveAvailable whether at least one day of paid leave is still available
     */
    public static WeekSubmission check(
            WeekTarget target,
            Map<LocalDate, BigDecimal> hours,
            Set<LocalDate> submittedDates,
            BigDecimal lockedHours,
            Set<LocalDate> pendingLeaveDates,
            boolean paidLeaveAvailable) {
        List<EmptyDay> empty = new ArrayList<>();
        BigDecimal required = target.expectedHours();
        BigDecimal entered = lockedHours;
        for (BigDecimal h : hours.values()) {
            entered = entered.add(h);
        }
        for (WeekTarget.Day d : target.days()) {
            if (!d.takesHours() || submittedDates.contains(d.date())) {
                continue;
            }
            BigDecimal h = hours.get(d.date());
            if (h != null && h.signum() > 0) {
                continue;   // worked
            }
            Empty meaning = pendingLeaveDates.contains(d.date()) ? Empty.PENDING_LEAVE
                    : h == null ? Empty.UNFILLED
                    : paidLeaveAvailable ? Empty.NEEDS_LEAVE
                    : Empty.LOP;
            empty.add(new EmptyDay(d.date(), meaning, d.targetHours()));
            if (meaning == Empty.LOP || meaning == Empty.PENDING_LEAVE) {
                required = required.subtract(d.targetHours());
            }
        }

        // Approved leave counts toward the week's hours, alongside the hours worked.
        BigDecimal leave = target.totals().leaveHours();
        BigDecimal total = required.add(leave);
        BigDecimal counted = entered.add(leave);
        String split = leave.signum() > 0
                ? " (" + TimesheetService.plain(leave) + " h approved leave + " + TimesheetService.plain(required) + " h worked)"
                : "";

        String problem = null;
        List<String> needLeave = empty.stream().filter(e -> e.meaning() == Empty.NEEDS_LEAVE)
                .map(e -> DAY.format(e.date())).toList();
        List<String> unfilled = empty.stream().filter(e -> e.meaning() == Empty.UNFILLED)
                .map(e -> DAY.format(e.date())).toList();
        if (entered.signum() == 0) {
            // A week is never sent with no hours at all, even when every day would be LOP.
            problem = required.signum() <= 0 ? "Enter hours for at least one working day."
                    : leave.signum() > 0
                    ? "Enter this week's hours worked: " + TimesheetService.plain(total) + " h less "
                            + TimesheetService.plain(leave) + " h approved leave leaves " + TimesheetService.plain(required) + " h."
                    : "Enter this week's " + TimesheetService.plain(required) + " hours.";
        } else if (!needLeave.isEmpty()) {
            problem = String.join(", ", needLeave) + (needLeave.size() == 1 ? " has" : " have")
                    + " no hours. You still have paid leave, so apply for leave for "
                    + (needLeave.size() == 1 ? "that day" : "those days") + " or enter the hours worked.";
        } else if (!unfilled.isEmpty()) {
            problem = String.join(", ", unfilled) + (unfilled.size() == 1 ? " is" : " are")
                    + " not filled in. Enter the hours worked, or 0 for a day you did not work.";
        } else if (entered.compareTo(required) < 0) {
            problem = "Enter " + TimesheetService.plain(total.subtract(counted)) + " more hours: this week needs exactly "
                    + TimesheetService.plain(total) + " hours" + split + ".";
        } else if (entered.compareTo(required) > 0) {
            problem = "This week needs exactly " + TimesheetService.plain(total) + " hours" + split + ", but "
                    + TimesheetService.plain(counted) + (leave.signum() > 0 ? " are counted" : " are entered") + ". Remove "
                    + TimesheetService.plain(counted.subtract(total)) + " hours.";
        }
        return new WeekSubmission(empty, required, entered, leave, problem);
    }

    public List<EmptyDay> emptyDays() {
        return emptyDays;
    }

    /** The week's target minus empty LOP and pending-leave days: what must be entered exactly. */
    public BigDecimal requiredHours() {
        return requiredHours;
    }

    public BigDecimal enteredHours() {
        return enteredHours;
    }

    /** Hours of approved leave in the week: they count toward its hours. */
    public BigDecimal leaveHours() {
        return leaveHours;
    }

    /** Everything the week must add up to: hours worked plus approved leave. */
    public BigDecimal totalHours() {
        return requiredHours.add(leaveHours);
    }

    /** What counts so far: hours worked plus approved leave. */
    public BigDecimal countedHours() {
        return enteredHours.add(leaveHours);
    }

    /** Why the week can't be submitted, or null if the hours are right. */
    public String problem() {
        return problem;
    }

    public long lopDays() {
        return emptyDays.stream().filter(e -> e.meaning() == Empty.LOP).count();
    }
}
