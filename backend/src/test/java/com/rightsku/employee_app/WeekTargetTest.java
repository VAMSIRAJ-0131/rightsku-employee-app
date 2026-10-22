package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

/** The weekly target on its own: plain Java, no Spring or database. */
class WeekTargetTest {

    private static final LocalDate MONDAY = LocalDate.parse("2026-10-05");

    /** Seven days from Monday: "W" working, "O" weekly off, "H" holiday on a working day, "X" holiday on a weekly off. */
    private static List<WorkCalendar.Day> week(String pattern, String hoursPerDay) {
        List<WorkCalendar.Day> days = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            char c = pattern.charAt(i);
            WorkCalendar.DayKind kind = c == 'W' ? WorkCalendar.DayKind.WORKING
                    : c == 'O' ? WorkCalendar.DayKind.WEEKLY_OFF : WorkCalendar.DayKind.HOLIDAY;
            boolean weeklyOff = c == 'O' || c == 'X';
            days.add(new WorkCalendar.Day(MONDAY.plusDays(i), kind, weeklyOff, kind == WorkCalendar.DayKind.HOLIDAY ? "Holiday" : null,
                    new BigDecimal(hoursPerDay)));
        }
        return days;
    }

    private static LeaveDays.LeaveDay leave(int dayIndex, LeaveDays.Portion portion, LeaveDays.Status status) {
        return new LeaveDays.LeaveDay(MONDAY.plusDays(dayIndex), portion, status);
    }

    @Test
    void fiveNineHourDaysAreFortyFive() {
        WeekTarget t = WeekTarget.of(week("WWWWWOO", "9"), null, List.of());
        assertThat(t.expectedHours()).isEqualByComparingTo("45");
        assertThat(t.lastWorkingDay()).isEqualTo(MONDAY.plusDays(4));
    }

    @Test
    void aDayCountsAtMostNineHours() {
        // A 10-hour schedule can't be logged (9 h is the daily maximum), so each day counts 9.
        assertThat(WeekTarget.of(week("WWWWWOO", "10"), null, List.of()).expectedHours()).isEqualByComparingTo("45");
    }

    @Test
    void holidaysAndLeave() {
        assertThat(WeekTarget.of(week("WWWWHOO", "9"), null, List.of()).expectedHours()).as("holiday").isEqualByComparingTo("36");
        assertThat(WeekTarget.of(week("WWWWWXO", "9"), null, List.of()).expectedHours()).as("holiday on weekly off")
                .isEqualByComparingTo("45");
        assertThat(WeekTarget.of(week("WWWWWOO", "9"), null,
                List.of(leave(2, LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED))).expectedHours())
                .as("full day").isEqualByComparingTo("36");
        assertThat(WeekTarget.of(week("WWWWWOO", "9"), null,
                List.of(leave(2, LeaveDays.Portion.HALF_DAY, LeaveDays.Status.APPROVED))).expectedHours())
                .as("half day").isEqualByComparingTo("40.5");
        assertThat(WeekTarget.of(week("WWWWWOO", "9"), null, List.of(
                leave(1, LeaveDays.Portion.FULL_DAY, LeaveDays.Status.PENDING),
                leave(2, LeaveDays.Portion.FULL_DAY, LeaveDays.Status.REJECTED))).expectedHours())
                .as("pending and rejected").isEqualByComparingTo("45");
    }

    @Test
    void leaveOnAHolidayOrWeeklyOffChangesNothing() {
        WeekTarget t = WeekTarget.of(week("WWWWHOO", "9"), null, List.of(
                leave(4, LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED),
                leave(5, LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED)));
        assertThat(t.totals().holidayHours()).isEqualByComparingTo("9");
        assertThat(t.totals().leaveHours()).isEqualByComparingTo("0");
        assertThat(t.expectedHours()).isEqualByComparingTo("36");
    }

    @Test
    void holidayAndLeaveTogetherAndTheLastWorkingDay() {
        // Friday holiday, Thursday full leave: 27 h; submitting opens on Wednesday.
        WeekTarget t = WeekTarget.of(week("WWWWHOO", "9"), null,
                List.of(leave(3, LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED)));
        assertThat(t.expectedHours()).isEqualByComparingTo("27");
        assertThat(t.lastWorkingDay()).isEqualTo(MONDAY.plusDays(2));
    }

    @Test
    void aWeekWithNoWorkingDaysHasNoTarget() {
        WeekTarget t = WeekTarget.of(week("HHHHHOO", "9"), null, List.of());
        assertThat(t.expectedHours()).isEqualByComparingTo("0");
        assertThat(t.lastWorkingDay()).isNull();
    }
}
