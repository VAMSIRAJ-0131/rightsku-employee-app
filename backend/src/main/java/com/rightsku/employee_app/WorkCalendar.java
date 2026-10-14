package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Decides, for one employee, whether a date is a working day, a weekly off
 * or a company holiday. Plain Java with no Spring or database, so the rules
 * are easy to test.
 *
 * <ul>
 *   <li>The schedule for a date is the latest one whose effective date is on
 *       or before that date; before the first one, the company default
 *       applies. So an HR change never rewrites earlier dates.</li>
 *   <li>A company holiday is never a working day. When a holiday falls on a
 *       weekly off, the day is shown as the holiday and also marked as a
 *       weekly off.</li>
 * </ul>
 */
public final class WorkCalendar {

    public enum DayKind { WORKING, WEEKLY_OFF, HOLIDAY }

    /** A schedule. effectiveFrom is null for the company default. */
    public record Schedule(LocalDate effectiveFrom, Set<DayOfWeek> weeklyOffs, BigDecimal hoursPerDay) {
        public Schedule {
            weeklyOffs = weeklyOffs.isEmpty() ? Collections.unmodifiableSet(EnumSet.noneOf(DayOfWeek.class))
                    : Collections.unmodifiableSet(EnumSet.copyOf(weeklyOffs));
        }
    }

    public record Day(LocalDate date, DayKind kind, boolean weeklyOff, String holidayName, BigDecimal hoursPerDay) {
        public boolean working() {
            return kind == DayKind.WORKING;
        }
    }

    private final Schedule defaultSchedule;
    private final List<Schedule> schedules;
    private final Map<LocalDate, String> holidays;

    /**
     * @param defaultSchedule company default (effectiveFrom null)
     * @param schedules the employee's schedules, in any order
     * @param holidays company holidays by date (name as value)
     */
    public WorkCalendar(Schedule defaultSchedule, List<Schedule> schedules, Map<LocalDate, String> holidays) {
        this.defaultSchedule = defaultSchedule;
        List<Schedule> sorted = new ArrayList<>(schedules);
        sorted.sort(Comparator.comparing(Schedule::effectiveFrom));
        this.schedules = List.copyOf(sorted);
        this.holidays = Map.copyOf(holidays);
    }

    /** The schedule that applies on this date. */
    public Schedule scheduleOn(LocalDate date) {
        Schedule result = defaultSchedule;
        for (Schedule schedule : schedules) {
            if (!schedule.effectiveFrom().isAfter(date)) {
                result = schedule;
            } else {
                break;
            }
        }
        return result;
    }

    public Day day(LocalDate date) {
        Schedule schedule = scheduleOn(date);
        boolean weeklyOff = schedule.weeklyOffs().contains(date.getDayOfWeek());
        String holiday = holidays.get(date);
        DayKind kind = holiday != null ? DayKind.HOLIDAY : weeklyOff ? DayKind.WEEKLY_OFF : DayKind.WORKING;
        return new Day(date, kind, weeklyOff, holiday, schedule.hoursPerDay());
    }

    /** Every day from start to end, both included. */
    public List<Day> days(LocalDate start, LocalDate end) {
        List<Day> days = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            days.add(day(d));
        }
        return days;
    }

    /* ---------- Weekly off bit mask (stored in employee_work_schedules) ---------- */

    /** Monday = 1, Tuesday = 2, ... Sunday = 64. */
    public static int toMask(Set<DayOfWeek> days) {
        int mask = 0;
        for (DayOfWeek day : days) {
            mask |= 1 << (day.getValue() - 1);
        }
        return mask;
    }

    public static Set<DayOfWeek> fromMask(int mask) {
        Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
        for (DayOfWeek day : DayOfWeek.values()) {
            if ((mask & (1 << (day.getValue() - 1))) != 0) {
                days.add(day);
            }
        }
        return days;
    }
}
