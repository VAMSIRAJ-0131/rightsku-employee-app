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
 * The weekly summary the employee sees: Total hours (the schedule's five
 * working days, 45 for 9-hour days, also in a week with a holiday), Filled
 * hours (worked + approved leave, at most Total) and Unfilled hours. Weekly
 * offs and holidays are 0 h. Plain Java; the week is Monday 19 to Sunday 25 Oct 2026.
 */
class WeekSummaryTest {

    private static final LocalDate MONDAY = LocalDate.parse("2026-10-19");
    private static final WorkCalendar.Schedule DEFAULT = new WorkCalendar.Schedule(
            null, EnumSet.of(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), new BigDecimal("9"));

    private static WorkCalendar.Schedule offs(DayOfWeek a, DayOfWeek b) {
        return new WorkCalendar.Schedule(MONDAY, EnumSet.of(a, b), new BigDecimal("9"));
    }

    private static WeekTarget week(WorkCalendar.Schedule schedule, Map<LocalDate, String> holidays,
                                   LocalDate joining, List<LeaveDays.LeaveDay> leave) {
        WorkCalendar calendar = new WorkCalendar(DEFAULT, List.of(schedule), holidays);
        return WeekTarget.of(calendar.days(MONDAY, MONDAY.plusDays(6)), joining, leave);
    }

    private static LocalDate day(int i) {
        return MONDAY.plusDays(i);
    }

    private static BigDecimal h(String v) {
        return new BigDecimal(v);
    }

    private static LeaveDays.LeaveDay approved(int i, LeaveDays.Portion portion) {
        return new LeaveDays.LeaveDay(day(i), portion, LeaveDays.Status.APPROVED, "CASUAL");
    }

    @Test
    void tuesdayWednesdayOff_fiveFullDays_is45of45AndWeeklyOffsAreZero() {
        WeekTarget t = week(offs(DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY), Map.of(), null, List.of());

        assertThat(t.totalHours()).isEqualByComparingTo("45");
        assertThat(t.filledHours(h("45"))).isEqualByComparingTo("45");
        assertThat(t.unfilledHours(h("45"))).isEqualByComparingTo("0");
        assertThat(t.day(day(1)).creditedHours()).as("Tuesday off: 0 h").isEqualByComparingTo("0");
        assertThat(t.day(day(2)).creditedHours()).as("Wednesday off: 0 h").isEqualByComparingTo("0");
        assertThat(t.day(day(1)).takesHours()).isFalse();
        assertThat(t.day(day(5)).takesHours()).as("Saturday is a working day").isTrue();
        assertThat(t.day(day(6)).takesHours()).as("Sunday is a working day").isTrue();
    }

    @Test
    void onlyThreeWorkingDaysFilledLeaves18Unfilled() {
        WeekTarget t = week(offs(DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY), Map.of(), null, List.of());

        assertThat(t.filledHours(h("27"))).isEqualByComparingTo("27");
        assertThat(t.unfilledHours(h("27"))).isEqualByComparingTo("18");
        assertThat(t.filledHours(BigDecimal.ZERO)).isEqualByComparingTo("0");
    }

    @Test
    void aHolidayKeepsTheTotalAt45_addsNothingToFilled_andLeavesNothingUnfilled() {
        // Thursday 22 Oct is a holiday (Dasara); Saturday/Sunday off.
        WeekTarget t = week(offs(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), Map.of(day(3), "Dasara"), null, List.of());

        assertThat(t.totalHours()).isEqualByComparingTo("45");
        assertThat(t.day(day(3)).creditedHours()).as("holiday: 0 h").isEqualByComparingTo("0");
        assertThat(t.day(day(3)).takesHours()).isFalse();
        assertThat(t.filledHours(h("36"))).as("four working days done").isEqualByComparingTo("36");
        assertThat(t.unfilledHours(h("36"))).as("the holiday is excused, not owed").isEqualByComparingTo("0");
        assertThat(t.requiredHours()).isEqualByComparingTo("36");
        assertThat(t.unfilledHours(h("27"))).as("one working day still empty").isEqualByComparingTo("9");
    }

    @Test
    void theAgreedExample_tueWedOff_thursdayHoliday_fourFullDays_is45_36_0() {
        WeekTarget t = week(offs(DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY), Map.of(day(3), "Dasara"), null, List.of());

        assertThat(t.totalHours()).as("never 63 or 54").isEqualByComparingTo("45");
        assertThat(t.filledHours(h("36"))).isEqualByComparingTo("36");
        assertThat(t.unfilledHours(h("36"))).isEqualByComparingTo("0");
        // Filled never goes past Total.
        assertThat(t.filledHours(h("54"))).isEqualByComparingTo("45");
        assertThat(t.unfilledHours(h("54"))).isEqualByComparingTo("0");
    }

    @Test
    void approvedFullDayLeaveCountsOnceWithItsType() {
        WeekTarget t = week(offs(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), Map.of(), null,
                List.of(approved(0, LeaveDays.Portion.FULL_DAY)));

        assertThat(t.day(day(0)).creditedHours()).isEqualByComparingTo("9");
        assertThat(t.day(day(0)).leaveType()).isEqualTo("CASUAL");
        assertThat(t.day(day(0)).takesHours()).as("no hours can be typed on full-day leave").isFalse();
        assertThat(t.filledHours(h("36"))).isEqualByComparingTo("45");
    }

    @Test
    void approvedHalfDayLeaveCountsHalfTheDay() {
        WeekTarget t = week(offs(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), Map.of(), null,
                List.of(approved(0, LeaveDays.Portion.HALF_DAY)));

        assertThat(t.day(day(0)).creditedHours()).isEqualByComparingTo("4.5");
        assertThat(t.day(day(0)).takesHours()).as("the other half is worked").isTrue();
        assertThat(t.filledHours(h("40.5"))).isEqualByComparingTo("45");
    }

    @Test
    void pendingAndRejectedLeaveCountNothing() {
        List<LeaveDays.LeaveDay> leave = List.of(
                new LeaveDays.LeaveDay(day(0), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.PENDING, "SICK"),
                new LeaveDays.LeaveDay(day(1), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.REJECTED, "SICK"));
        WeekTarget t = week(offs(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), Map.of(), null, leave);

        assertThat(t.day(day(0)).creditedHours()).isEqualByComparingTo("0");
        assertThat(t.day(day(0)).leaveType()).isNull();
        assertThat(t.day(day(1)).creditedHours()).isEqualByComparingTo("0");
        assertThat(t.filledHours(h("27"))).isEqualByComparingTo("27");
    }

    @Test
    void overlappingDaysAddNothingTwice() {
        // A holiday on a weekly off (Tuesday), leave on a weekly off (Wednesday) and leave on a holiday (Thursday).
        WeekTarget t = week(offs(DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY),
                Map.of(day(1), "Holiday on a weekly off", day(3), "Holiday"), null,
                List.of(approved(2, LeaveDays.Portion.FULL_DAY), approved(3, LeaveDays.Portion.FULL_DAY)));

        assertThat(t.day(day(1)).creditedHours()).isEqualByComparingTo("0");
        assertThat(t.day(day(2)).creditedHours()).isEqualByComparingTo("0");
        assertThat(t.day(day(3)).creditedHours()).isEqualByComparingTo("0");
        assertThat(t.totals().leaveHours()).as("leave on a holiday or weekly off counts nothing").isEqualByComparingTo("0");
        assertThat(t.totalHours()).isEqualByComparingTo("45");
        assertThat(t.filledHours(h("36"))).isEqualByComparingTo("36");
        assertThat(t.unfilledHours(h("36"))).isEqualByComparingTo("0");
    }

    @Test
    void daysBeforeJoiningDoNotCount() {
        // Joined Thursday 22 Oct, Saturday/Sunday off: Thursday and Friday only.
        WeekTarget t = week(offs(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), Map.of(), day(3), List.of());

        assertThat(t.totalHours()).isEqualByComparingTo("18");
        assertThat(t.day(day(0)).creditedHours()).isEqualByComparingTo("0");
        assertThat(t.filledHours(h("18"))).isEqualByComparingTo("18");
    }

    @Test
    void everyPairOfWeeklyOffsGives45() {
        DayOfWeek[] days = DayOfWeek.values();
        for (int i = 0; i < days.length; i++) {
            for (int j = i + 1; j < days.length; j++) {
                assertThat(week(offs(days[i], days[j]), Map.of(), null, List.of()).totalHours())
                        .as(days[i] + "+" + days[j]).isEqualByComparingTo("45");
            }
        }
    }

    @Test
    void theReportedWeekOfEmployee10007IsNo54() {
        // Sat/Sun off from Monday 19 Oct, and an older Tue/Wed schedule saved to start on Saturday 24 Oct.
        // Dasara on Thursday 22. Before the fix this week needed 54 h.
        WorkSchedule fromMonday = WorkSchedule.create(4L, LocalDate.parse("2026-10-19"),
                EnumSet.of(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), new BigDecimal("9"), 1L);
        WorkSchedule fromSaturday = WorkSchedule.create(4L, LocalDate.parse("2026-10-24"),
                EnumSet.of(DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY), new BigDecimal("9"), 1L);
        WorkCalendar calendar = new WorkCalendar(DEFAULT, List.of(fromMonday.toSchedule(), fromSaturday.toSchedule()),
                Map.of(day(3), "Dasara"));

        WeekTarget t = WeekTarget.of(calendar.days(MONDAY, MONDAY.plusDays(6)), LocalDate.parse("2026-06-01"), List.of());

        assertThat(t.totalHours()).isEqualByComparingTo("45");
        assertThat(t.day(day(5)).weeklyOff()).as("Saturday 24 is off this week").isTrue();
        assertThat(t.day(day(6)).weeklyOff()).as("Sunday 25 is off this week").isTrue();
        assertThat(fromSaturday.toSchedule().effectiveFrom()).isEqualTo(LocalDate.parse("2026-10-26"));
    }
}
