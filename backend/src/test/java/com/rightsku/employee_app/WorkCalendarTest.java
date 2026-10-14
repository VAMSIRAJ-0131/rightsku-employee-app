package com.rightsku.employee_app;

import static java.time.DayOfWeek.FRIDAY;
import static java.time.DayOfWeek.MONDAY;
import static java.time.DayOfWeek.SATURDAY;
import static java.time.DayOfWeek.SUNDAY;
import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

/** Unit tests for working days, weekly offs and holidays. Plain Java. */
class WorkCalendarTest {

    private static final BigDecimal EIGHT = new BigDecimal("8.00");
    private static final WorkCalendar.Schedule COMPANY_DEFAULT =
            new WorkCalendar.Schedule(null, EnumSet.of(SATURDAY, SUNDAY), EIGHT);

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    @Test
    void withoutHrScheduleTheCompanyDefaultApplies() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(), Map.of());

        assertThat(calendar.day(d("2026-10-12")).kind()).isEqualTo(WorkCalendar.DayKind.WORKING);   // Monday
        assertThat(calendar.day(d("2026-10-10")).kind()).isEqualTo(WorkCalendar.DayKind.WEEKLY_OFF); // Saturday
        assertThat(calendar.day(d("2026-10-11")).kind()).isEqualTo(WorkCalendar.DayKind.WEEKLY_OFF); // Sunday
        assertThat(calendar.day(d("2026-10-12")).hoursPerDay()).isEqualTo(EIGHT);
    }

    @Test
    void differentEmployeesCanHaveDifferentWeeklyOffs() {
        WorkCalendar sixDayWeek = new WorkCalendar(COMPANY_DEFAULT,
                List.of(new WorkCalendar.Schedule(d("2026-01-01"), EnumSet.of(SUNDAY), new BigDecimal("7.50"))), Map.of());
        WorkCalendar fridayOff = new WorkCalendar(COMPANY_DEFAULT,
                List.of(new WorkCalendar.Schedule(d("2026-01-01"), EnumSet.of(FRIDAY, SATURDAY), EIGHT)), Map.of());

        assertThat(sixDayWeek.day(d("2026-10-10")).working()).as("Saturday, six-day week").isTrue();
        assertThat(sixDayWeek.day(d("2026-10-10")).hoursPerDay()).isEqualTo(new BigDecimal("7.50"));
        assertThat(sixDayWeek.day(d("2026-10-11")).working()).as("Sunday, six-day week").isFalse();
        assertThat(fridayOff.day(d("2026-10-09")).working()).as("Friday off").isFalse();
        assertThat(fridayOff.day(d("2026-10-11")).working()).as("Sunday is a working day").isTrue();
    }

    @Test
    void hrScheduleChangeAppliesFromItsDateOnly() {
        // Default Sat+Sun off until 4 Oct; from Monday 5 Oct only Sunday is off.
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT,
                List.of(new WorkCalendar.Schedule(d("2026-10-05"), EnumSet.of(SUNDAY), EIGHT)), Map.of());

        assertThat(calendar.day(d("2026-10-03")).kind()).as("Saturday before the change")
                .isEqualTo(WorkCalendar.DayKind.WEEKLY_OFF);
        assertThat(calendar.day(d("2026-10-10")).kind()).as("Saturday after the change")
                .isEqualTo(WorkCalendar.DayKind.WORKING);
        assertThat(calendar.scheduleOn(d("2026-10-04")).effectiveFrom()).isNull();
        assertThat(calendar.scheduleOn(d("2026-10-05")).effectiveFrom()).isEqualTo(d("2026-10-05"));
    }

    @Test
    void laterOfSeveralSchedulesWinsRegardlessOfOrder() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(
                new WorkCalendar.Schedule(d("2026-11-01"), EnumSet.of(MONDAY), EIGHT),
                new WorkCalendar.Schedule(d("2026-10-01"), EnumSet.of(SUNDAY), EIGHT)), Map.of());

        assertThat(calendar.scheduleOn(d("2026-10-20")).weeklyOffs()).containsExactly(SUNDAY);
        assertThat(calendar.scheduleOn(d("2026-11-20")).weeklyOffs()).containsExactly(MONDAY);
        assertThat(calendar.scheduleOn(d("2026-09-20")).effectiveFrom()).isNull();
    }

    @Test
    void holidayIsNeverAWorkingDay() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(), Map.of(d("2026-10-02"), "Gandhi Jayanti"));

        WorkCalendar.Day day = calendar.day(d("2026-10-02")); // Friday
        assertThat(day.kind()).isEqualTo(WorkCalendar.DayKind.HOLIDAY);
        assertThat(day.working()).isFalse();
        assertThat(day.weeklyOff()).isFalse();
        assertThat(day.holidayName()).isEqualTo("Gandhi Jayanti");
    }

    @Test
    void holidayOnAWeeklyOffShowsAsHolidayAndIsMarkedWeeklyOff() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(), Map.of(d("2026-10-03"), "Test holiday"));

        WorkCalendar.Day day = calendar.day(d("2026-10-03")); // Saturday
        assertThat(day.kind()).isEqualTo(WorkCalendar.DayKind.HOLIDAY);
        assertThat(day.weeklyOff()).isTrue();
        assertThat(day.working()).isFalse();
    }

    @Test
    void daysCoversTheWholeRange() {
        WorkCalendar calendar = new WorkCalendar(COMPANY_DEFAULT, List.of(), Map.of(d("2026-10-02"), "Gandhi Jayanti"));

        List<WorkCalendar.Day> week = calendar.days(d("2026-09-28"), d("2026-10-04"));

        assertThat(week).hasSize(7);
        assertThat(week).filteredOn(WorkCalendar.Day::working).hasSize(4);
        assertThat(week.get(4).kind()).isEqualTo(WorkCalendar.DayKind.HOLIDAY);
    }

    @Test
    void weeklyOffMaskRoundTrips() {
        assertThat(WorkCalendar.toMask(EnumSet.of(MONDAY))).isEqualTo(1);
        assertThat(WorkCalendar.toMask(EnumSet.of(SATURDAY, SUNDAY))).isEqualTo(96);
        assertThat(WorkCalendar.toMask(EnumSet.noneOf(DayOfWeek.class))).isZero();
        for (int mask = 0; mask < 127; mask++) {
            Set<DayOfWeek> days = WorkCalendar.fromMask(mask);
            assertThat(WorkCalendar.toMask(days)).isEqualTo(mask);
        }
    }
}
