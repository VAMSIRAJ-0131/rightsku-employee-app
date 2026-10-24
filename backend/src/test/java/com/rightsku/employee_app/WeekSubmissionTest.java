package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.junit.jupiter.api.Test;

/** The weekly submission rule on its own (no Spring, no database). Week of Mon 5 Oct 2026, 9-hour days. */
class WeekSubmissionTest {

    private static final LocalDate MON = LocalDate.parse("2026-10-05");

    private static WeekTarget target(Map<LocalDate, String> holidays, List<LeaveDays.LeaveDay> leave, LocalDate joined) {
        WorkCalendar.Schedule schedule = new WorkCalendar.Schedule(null, EnumSet.of(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY),
                new BigDecimal("9"));
        WorkCalendar calendar = new WorkCalendar(schedule, List.of(), holidays);
        return WeekTarget.of(calendar.days(MON, MON.plusDays(6)), joined, leave);
    }

    private static WeekTarget normal() {
        return target(Map.of(), List.of(), null);
    }

    /** Mon..Fri hours; "" leaves the day blank (not filled in), "0" means not worked. */
    private static Map<LocalDate, BigDecimal> hours(String... perDay) {
        Map<LocalDate, BigDecimal> result = new TreeMap<>();
        for (int i = 0; i < perDay.length; i++) {
            if (!perDay[i].isEmpty()) {
                result.put(MON.plusDays(i), new BigDecimal(perDay[i]));
            }
        }
        return result;
    }

    private static WeekSubmission check(WeekTarget t, Map<LocalDate, BigDecimal> hours, Set<LocalDate> pending, boolean leaveLeft) {
        return WeekSubmission.check(t, hours, Set.of(), BigDecimal.ZERO, pending, leaveLeft);
    }

    @Test
    void aFullWeekMustBeExactly45Hours() {
        assertThat(check(normal(), hours("9", "9", "9", "9", "9"), Set.of(), true).problem()).isNull();
        assertThat(check(normal(), hours("9", "9", "9", "9", "8.75"), Set.of(), true).problem())
                .isEqualTo("Enter 0.25 more hours: this week needs exactly 45 hours.");
    }

    @Test
    void noPaidLeaveLeftMakesAZeroHourDayLop() {
        WeekSubmission s = check(normal(), hours("9", "9", "9", "9", "0"), Set.of(), false);
        assertThat(s.problem()).isNull();
        assertThat(s.requiredHours()).isEqualByComparingTo("36");
        assertThat(s.lopDays()).isEqualTo(1);
        assertThat(s.emptyDays()).extracting(WeekSubmission.EmptyDay::meaning).containsExactly(WeekSubmission.Empty.LOP);
    }

    @Test
    void withPaidLeaveLeftAZeroHourDayBlocksSubmitting() {
        WeekSubmission s = check(normal(), hours("9", "9", "9", "9", "0"), Set.of(), true);
        assertThat(s.problem()).startsWith("Fri 9 Oct has no hours. You still have paid leave");
        assertThat(s.lopDays()).isZero();
    }

    @Test
    void aDayWithLeaveWaitingIsNeitherLopNorBlocking() {
        WeekSubmission s = check(normal(), hours("9", "9", "9", "9", ""), Set.of(MON.plusDays(4)), true);
        assertThat(s.problem()).isNull();
        assertThat(s.requiredHours()).isEqualByComparingTo("36");
        assertThat(s.emptyDays()).extracting(WeekSubmission.EmptyDay::meaning).containsExactly(WeekSubmission.Empty.PENDING_LEAVE);
    }

    @Test
    void holidaysApprovedLeaveAndDaysBeforeJoiningAreNeverEmptyDays() {
        WeekTarget t = target(Map.of(MON.plusDays(4), "Holiday"),
                List.of(new LeaveDays.LeaveDay(MON.plusDays(1), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED)),
                MON.plusDays(1));   // joined on Tuesday
        // Monday: before joining. Tuesday: approved leave. Friday: holiday. Wednesday worked, Thursday 0 hours.
        WeekSubmission s = check(t, hours("", "", "9", "0"), Set.of(), false);
        assertThat(t.expectedHours()).isEqualByComparingTo("18");
        assertThat(s.emptyDays()).extracting(WeekSubmission.EmptyDay::date).containsExactly(MON.plusDays(3));
        assertThat(s.requiredHours()).isEqualByComparingTo("9");
        assertThat(s.problem()).isNull();
    }

    @Test
    void moreThanTheTargetIsRefused() {
        WeekTarget t = target(Map.of(), List.of(), null);
        WeekSubmission s = check(t, hours("9", "9", "9", "9", "9"), Set.of(), false);
        assertThat(s.problem()).isNull();
        WeekSubmission over = WeekSubmission.check(t, hours("9", "9", "9", "9", "9"), Set.of(), new BigDecimal("1"), Set.of(), false);
        assertThat(over.problem()).isEqualTo("This week needs exactly 45 hours, but 46 are entered. Remove 1 hours.");
    }

    @Test
    void approvedLeaveCountsTowardThe45Hours() {
        // Mon worked 9 h, Tue-Thu approved leave (27 h), Fri still empty: 45 - 9 - 27 = 9 h remaining.
        List<LeaveDays.LeaveDay> leave = List.of(
                new LeaveDays.LeaveDay(MON.plusDays(1), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED),
                new LeaveDays.LeaveDay(MON.plusDays(2), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED),
                new LeaveDays.LeaveDay(MON.plusDays(3), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED));
        WeekTarget t = target(Map.of(), leave, null);

        WeekSubmission partial = check(t, hours("9", "", "", "", "8"), Set.of(), true);
        assertThat(partial.totalHours()).isEqualByComparingTo("45");
        assertThat(partial.leaveHours()).isEqualByComparingTo("27");
        assertThat(partial.countedHours()).isEqualByComparingTo("44");
        assertThat(partial.problem()).isEqualTo("Enter 1 more hours: this week needs exactly 45 hours (27 h approved leave + 18 h worked).");

        // Leave days are never empty days: no "apply for leave" for them, and they are never LOP.
        assertThat(partial.emptyDays()).isEmpty();
        assertThat(check(t, hours("9", "", "", "", "9"), Set.of(), false).problem()).isNull();
        assertThat(check(t, hours("9", "", "", "", "9.5"), Set.of(), false).problem())
                .isEqualTo("This week needs exactly 45 hours (27 h approved leave + 18 h worked), but 45.5 are counted. Remove 0.5 hours.");
    }

    @Test
    void approvedLeaveAndALopDayTogether() {
        // Tue approved leave, Fri 0 hours with no paid leave left: 45 - 9 LOP = 36 = 27 worked + 9 leave.
        WeekTarget t = target(Map.of(),
                List.of(new LeaveDays.LeaveDay(MON.plusDays(1), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED)), null);
        WeekSubmission s = check(t, hours("9", "", "9", "9", "0"), Set.of(), false);
        assertThat(s.problem()).isNull();
        assertThat(s.totalHours()).isEqualByComparingTo("36");
        assertThat(s.lopDays()).isEqualTo(1);
    }

    @Test
    void lopIsOnlyADayWithZeroEnteredABlankDayIsUnfilled() {
        // No paid leave left. Fri entered as 0 = LOP: 45 - 9 = 36 required.
        // Mon 9 worked, Tue-Thu still blank: 36 - 9 = 27 unfilled, and submitting is blocked.
        WeekSubmission partly = check(normal(), hours("9", "", "", "", "0"), Set.of(), false);
        assertThat(partly.totalHours()).isEqualByComparingTo("36");
        assertThat(partly.countedHours()).isEqualByComparingTo("9");
        assertThat(partly.totalHours().subtract(partly.countedHours())).as("unfilled").isEqualByComparingTo("27");
        assertThat(partly.lopDays()).isEqualTo(1);
        assertThat(partly.problem()).isEqualTo("Tue 6 Oct, Wed 7 Oct, Thu 8 Oct are not filled in. Enter the hours worked, or 0 for a day you did not work.");
    }

    @Test
    void workedPlusApprovedLeaveAndOneLopDayLeavesNothingUnfilled() {
        // Mon 9 worked, Tue-Thu approved leave (27 h), Fri 0 with no paid leave left (LOP).
        WeekTarget t = target(Map.of(), List.of(
                new LeaveDays.LeaveDay(MON.plusDays(1), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED),
                new LeaveDays.LeaveDay(MON.plusDays(2), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED),
                new LeaveDays.LeaveDay(MON.plusDays(3), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.APPROVED)), null);
        WeekSubmission s = check(t, hours("9", "", "", "", "0"), Set.of(), false);
        assertThat(s.totalHours()).as("45 - 9 LOP").isEqualByComparingTo("36");
        assertThat(s.countedHours()).as("9 worked + 27 leave").isEqualByComparingTo("36");
        assertThat(s.problem()).isNull();
        assertThat(s.lopDays()).isEqualTo(1);
    }

    @Test
    void aBlankDayWithLeaveWaitingIsNotUnfilled() {
        WeekSubmission s = check(normal(), hours("9", "9", "9", "9", ""), Set.of(MON.plusDays(4)), true);
        assertThat(s.emptyDays()).extracting(WeekSubmission.EmptyDay::meaning).containsExactly(WeekSubmission.Empty.PENDING_LEAVE);
        assertThat(s.problem()).isNull();
    }

    @Test
    void aWeekWithNoHoursAtAllIsNeverSubmittable() {
        assertThat(check(normal(), hours("0", "0", "0", "0", "0"), Set.of(), false).problem())
                .isEqualTo("Enter hours for at least one working day.");
        assertThat(check(normal(), hours("", "", "", "", ""), Set.of(), true).problem())
                .isEqualTo("Enter this week's 45 hours.");
    }
}
