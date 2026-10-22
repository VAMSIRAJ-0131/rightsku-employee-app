package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Works out how many hours an employee is expected to work in one week.
 * Plain Java (no Spring or database) so every rule is easy to test.
 *
 * <ul>
 *   <li>Each scheduled working day counts its HR schedule hours, at most
 *       {@value TimesheetService#MAX_HOURS_PER_DAY} (the most one day can
 *       take). Five 9-hour days give 45 hours.</li>
 *   <li>Weekly offs never count, even when a holiday falls on them, so a
 *       holiday on a weekly off does not lower the target a second time.</li>
 *   <li>A company holiday on a working day lowers the target by that day's
 *       hours.</li>
 *   <li>Only APPROVED leave lowers the target: a full day by that day's
 *       hours, a half day by half of them. Pending and rejected leave, and
 *       leave on a holiday or weekly off, change nothing.</li>
 *   <li>Days before the joining date do not count.</li>
 * </ul>
 * Leave is never added to the hours worked; it is shown as its own line.
 */
public final class WeekTarget {

    private static final BigDecimal MAX_DAY = BigDecimal.valueOf(TimesheetService.MAX_HOURS_PER_DAY);
    private static final BigDecimal TWO = BigDecimal.valueOf(2);

    /**
     * One day of the week.
     *
     * @param scheduledHours the day's schedule hours if it counts towards the week, else 0
     * @param holidayHours hours taken off the target because of a holiday
     * @param leave approved leave on this day, or null
     * @param leaveHours hours taken off the target because of approved leave
     * @param targetHours hours expected on this day (scheduled - holiday - leave)
     * @param takesHours whether hours can be entered for this day
     */
    public record Day(
            LocalDate date,
            WorkCalendar.DayKind kind,
            boolean weeklyOff,
            String holidayName,
            boolean beforeJoining,
            BigDecimal scheduledHours,
            BigDecimal holidayHours,
            LeaveDays.Portion leave,
            BigDecimal leaveHours,
            BigDecimal targetHours,
            boolean takesHours) {
    }

    public record Totals(BigDecimal scheduledHours, BigDecimal holidayHours, BigDecimal leaveHours, BigDecimal expectedHours) {
    }

    private final List<Day> days;
    private final Totals totals;

    private WeekTarget(List<Day> days, Totals totals) {
        this.days = List.copyOf(days);
        this.totals = totals;
    }

    /**
     * @param calendarDays the seven days of the week from the employee's {@link WorkCalendar}
     * @param joiningDate the employee's joining date, or null
     * @param leave the employee's leave in that week (any status; only APPROVED is used)
     */
    public static WeekTarget of(List<WorkCalendar.Day> calendarDays, LocalDate joiningDate, List<LeaveDays.LeaveDay> leave) {
        Map<LocalDate, LeaveDays.Portion> approved = new HashMap<>();
        for (LeaveDays.LeaveDay l : leave) {
            if (l.status() == LeaveDays.Status.APPROVED) {
                // A full day wins if the same date somehow has both.
                approved.merge(l.date(), l.portion(),
                        (a, b) -> a == LeaveDays.Portion.FULL_DAY || b == LeaveDays.Portion.FULL_DAY
                                ? LeaveDays.Portion.FULL_DAY : LeaveDays.Portion.HALF_DAY);
            }
        }

        List<Day> result = new ArrayList<>();
        BigDecimal scheduled = zero();
        BigDecimal holidays = zero();
        BigDecimal leaveTotal = zero();
        for (WorkCalendar.Day d : calendarDays) {
            boolean beforeJoining = joiningDate != null && d.date().isBefore(joiningDate);
            // Weekly offs never count, also when a holiday falls on them.
            boolean counts = !d.weeklyOff() && !beforeJoining;
            BigDecimal dayHours = counts ? d.hoursPerDay().min(MAX_DAY).setScale(2, RoundingMode.HALF_UP) : zero();

            BigDecimal holidayHours = zero();
            LeaveDays.Portion leavePortion = null;
            BigDecimal leaveHours = zero();
            if (counts && d.kind() == WorkCalendar.DayKind.HOLIDAY) {
                holidayHours = dayHours;
            } else if (counts && d.kind() == WorkCalendar.DayKind.WORKING) {
                leavePortion = approved.get(d.date());
                if (leavePortion == LeaveDays.Portion.FULL_DAY) {
                    leaveHours = dayHours;
                } else if (leavePortion == LeaveDays.Portion.HALF_DAY) {
                    leaveHours = dayHours.divide(TWO, 2, RoundingMode.HALF_UP);
                }
            }
            BigDecimal target = dayHours.subtract(holidayHours).subtract(leaveHours);
            boolean takesHours = counts && d.kind() == WorkCalendar.DayKind.WORKING
                    && leavePortion != LeaveDays.Portion.FULL_DAY;

            result.add(new Day(d.date(), d.kind(), d.weeklyOff(), d.holidayName(), beforeJoining,
                    dayHours, holidayHours, leavePortion, leaveHours, target, takesHours));
            scheduled = scheduled.add(dayHours);
            holidays = holidays.add(holidayHours);
            leaveTotal = leaveTotal.add(leaveHours);
        }
        BigDecimal expected = scheduled.subtract(holidays).subtract(leaveTotal);
        return new WeekTarget(result, new Totals(scheduled, holidays, leaveTotal, expected));
    }

    private static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(2);
    }

    public List<Day> days() {
        return days;
    }

    public Totals totals() {
        return totals;
    }

    public BigDecimal expectedHours() {
        return totals.expectedHours();
    }

    /** The last day of the week that takes hours, or null if none does. Submitting opens on this day. */
    public LocalDate lastWorkingDay() {
        LocalDate last = null;
        for (Day d : days) {
            if (d.takesHours()) {
                last = d.date();
            }
        }
        return last;
    }

    public Day day(LocalDate date) {
        for (Day d : days) {
            if (d.date().equals(date)) {
                return d;
            }
        }
        return null;
    }
}
