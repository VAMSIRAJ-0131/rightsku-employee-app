package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * A weekly off other than Saturday/Sunday, from the HR schedule through the
 * calendar to the weekly target. Plain Java: no Spring or database.
 */
class CustomWeeklyOffTest {

    private static final WorkCalendar.Schedule COMPANY_DEFAULT = new WorkCalendar.Schedule(
            null, EnumSet.of(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), new BigDecimal("9"));
    private static final LocalDate MONDAY = LocalDate.parse("2026-10-19");

    private static WorkCalendar.Schedule tuesdayWednesdayOffFrom(String monday) {
        return new WorkCalendar.Schedule(LocalDate.parse(monday), EnumSet.of(DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY),
                new BigDecimal("9"));
    }

    @Test
    void tuesdayWednesdayOffNeedsFortyFiveHoursWithSaturdayAndSundayAsWorkingDays() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(tuesdayWednesdayOffFrom("2026-10-19")), Map.of());
        List<WorkCalendar.Day> week = calendar.days(MONDAY, MONDAY.plusDays(6));

        WeekTarget target = WeekTarget.of(week, null, List.of());

        assertThat(target.expectedHours()).isEqualByComparingTo("45");
        assertThat(week).extracting(WorkCalendar.Day::working)
                .containsExactly(true, false, false, true, true, true, true);
        assertThat(target.lastWorkingDay()).isEqualTo(MONDAY.plusDays(6));
    }

    @Test
    void theWeekBeforeAChangeKeepsTheOldWeeklyOffs() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(tuesdayWednesdayOffFrom("2026-10-19")), Map.of());
        LocalDate before = MONDAY.minusDays(7);

        WeekTarget target = WeekTarget.of(calendar.days(before, before.plusDays(6)), null, List.of());

        assertThat(target.expectedHours()).isEqualByComparingTo("45");
        assertThat(calendar.day(before.plusDays(1)).working()).as("Tuesday 13 Oct").isTrue();
        assertThat(calendar.day(before.plusDays(5)).working()).as("Saturday 17 Oct").isFalse();
    }

    @Test
    void aSchedulePerWeekNeverAddsUpToSevenWorkingDays() {
        // The old problem: a change starting on a Saturday made the whole week 7 working days (63 h).
        WorkCalendar midWeek = new WorkCalendar(COMPANY_DEFAULT, List.of(tuesdayWednesdayOffFrom("2026-10-24")), Map.of());
        assertThat(WeekTarget.of(midWeek.days(MONDAY, MONDAY.plusDays(6)), null, List.of()).expectedHours())
                .isEqualByComparingTo("63");
        // Schedules now start on Mondays, so each week has exactly one schedule: 45 h.
        WorkCalendar monday = new WorkCalendar(COMPANY_DEFAULT, List.of(tuesdayWednesdayOffFrom("2026-10-19")), Map.of());
        assertThat(WeekTarget.of(monday.days(MONDAY, MONDAY.plusDays(6)), null, List.of()).expectedHours())
                .isEqualByComparingTo("45");
    }

    @Test
    void aHolidayOnACustomWeeklyOffDoesNotLowerTheTargetTwice() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(tuesdayWednesdayOffFrom("2026-10-19")),
                Map.of(MONDAY.plusDays(1), "Holiday on Tuesday", MONDAY.plusDays(5), "Holiday on Saturday"));

        WeekTarget target = WeekTarget.of(calendar.days(MONDAY, MONDAY.plusDays(6)), null, List.of());

        // Tuesday was already off; Saturday was a working day: 45 - 9.
        assertThat(target.expectedHours()).isEqualByComparingTo("36");
    }

    @Test
    void withScheduleReplacesOnlyTheSameStartDate() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(tuesdayWednesdayOffFrom("2026-10-19")), Map.of());

        WorkCalendar changed = calendar.withSchedule(new WorkCalendar.Schedule(
                LocalDate.parse("2026-10-19"), EnumSet.of(DayOfWeek.FRIDAY), new BigDecimal("9")));

        assertThat(changed.day(MONDAY.plusDays(1)).working()).as("Tuesday now works").isTrue();
        assertThat(changed.day(MONDAY.plusDays(4)).working()).as("Friday now off").isFalse();
        assertThat(calendar.day(MONDAY.plusDays(1)).working()).as("the original is unchanged").isFalse();
        assertThat(changed.day(MONDAY.minusDays(2)).working()).as("before the change: default").isFalse();
    }
}
