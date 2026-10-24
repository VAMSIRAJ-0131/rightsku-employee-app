package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Salary summary rules, worked through September 2026 by hand.
 *
 * September 2026: 30 days, starts on a Tuesday. Weekly offs Saturday and
 * Sunday: 5, 6, 12, 13, 19, 20, 26, 27 (8 days). Company holiday: Monday 14.
 * So 21 working days for someone employed the whole month. Timesheet weeks
 * start on Mondays: 31 Aug, 7, 14, 21 and 28 Sep.
 */
class SalarySummaryServiceTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock AFTER_MONTH = Clock.fixed(Instant.parse("2026-10-05T05:00:00Z"), INDIA);
    private static final Clock MID_MONTH = Clock.fixed(Instant.parse("2026-09-15T05:00:00Z"), INDIA);

    private EmployeeRepository employees;
    private TimesheetEntryRepository timesheets;
    private TimesheetWeekRepository weekRepository;
    private LeaveRequestRepository leaveRequests;
    private WorkCalendarService calendars;
    private final List<Employee> people = new ArrayList<>();
    private final List<TimesheetEntry> entries = new ArrayList<>();
    private final List<TimesheetWeek> weeks = new ArrayList<>();
    private final List<LeaveRequest> leaves = new ArrayList<>();

    @BeforeEach
    void setUp() {
        employees = mock(EmployeeRepository.class);
        timesheets = mock(TimesheetEntryRepository.class);
        weekRepository = mock(TimesheetWeekRepository.class);
        leaveRequests = mock(LeaveRequestRepository.class);
        WorkScheduleRepository schedules = mock(WorkScheduleRepository.class);
        CompanyHolidayRepository holidays = mock(CompanyHolidayRepository.class);
        List<CompanyHoliday> holidayRows = List.of(CompanyHoliday.create(LocalDate.parse("2026-09-14"), "Test holiday", 1L));
        when(holidays.findByHolidayDateBetweenOrderByHolidayDateAsc(any(), any())).thenAnswer(call -> {
            LocalDate from = call.getArgument(0);
            LocalDate to = call.getArgument(1);
            return holidayRows.stream().filter(h -> !h.getDate().isBefore(from) && !h.getDate().isAfter(to)).toList();
        });
        calendars = new WorkCalendarService(schedules, holidays, "SATURDAY,SUNDAY", new BigDecimal("9"));

        when(employees.findAll(any(Sort.class))).thenAnswer(call -> people);
        when(timesheets.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(anyLong(), any(), any())).thenAnswer(call -> {
            long id = call.getArgument(0);
            LocalDate from = call.getArgument(1);
            LocalDate to = call.getArgument(2);
            return entries.stream().filter(t -> t.getEmployeeId() == id
                    && !t.getWorkDate().isBefore(from) && !t.getWorkDate().isAfter(to)).toList();
        });
        when(weekRepository.findByEmployeeIdAndWeekStartBetween(anyLong(), any(), any())).thenAnswer(call -> {
            long id = call.getArgument(0);
            LocalDate from = call.getArgument(1);
            LocalDate to = call.getArgument(2);
            return weeks.stream().filter(w -> w.getEmployeeId() == id
                    && !w.getWeekStart().isBefore(from) && !w.getWeekStart().isAfter(to)).toList();
        });
        when(leaveRequests.touching(anyLong(), any(), any())).thenAnswer(call -> {
            long id = call.getArgument(0);
            LocalDate from = call.getArgument(1);
            LocalDate to = call.getArgument(2);
            return leaves.stream().filter(r -> r.getEmployeeId() == id
                    && !r.getStartDate().isAfter(to) && !r.getEndDate().isBefore(from)).toList();
        });
    }

    private SalarySummaryService service(Clock clock) {
        return new SalarySummaryService(employees, timesheets, weekRepository, leaveRequests, calendars, clock);
    }

    private Employee employee(long id, String code, String first, String joined) {
        AppUser account = AppUser.create(code, code.toLowerCase() + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", id + 100);
        Employee e = Employee.create(account, code, new Employee.EmployeeDetails(first, "Test", null, null, null,
                joined == null ? null : LocalDate.parse(joined)));
        ReflectionTestUtils.setField(e, "id", id);
        people.add(e);
        return e;
    }

    private void timesheet(long employeeId, String date, String status) {
        TimesheetEntry t = TimesheetEntry.submit(employeeId, LocalDate.parse(date), new BigDecimal("9"), "Work");
        ReflectionTestUtils.setField(t, "status", status);
        entries.add(t);
    }

    /** The week starting on this Monday was submitted as a whole. */
    private void submittedWeek(long employeeId, String monday) {
        TimesheetWeek w = TimesheetWeek.start(employeeId, LocalDate.parse(monday));
        w.markSubmitted("Work", Instant.parse("2026-09-30T10:00:00Z"));
        weeks.add(w);
    }

    private void leave(long employeeId, String from, String to, String status) {
        LeaveRequest r = LeaveRequest.apply(employeeId, LeaveType.CASUAL, LocalDate.parse(from), LocalDate.parse(to),
                BigDecimal.ONE, "Family function");
        ReflectionTestUtils.setField(r, "status", status);
        leaves.add(r);
    }

    private void approvedDays(long employeeId, String... days) {
        for (String d : days) {
            timesheet(employeeId, "2026-09-" + d, "APPROVED");
        }
    }

    @Test
    void everyDayIsCountedOnceAndOnlyApprovedZeroHourDaysAreLop() {
        employee(10L, "EMP010", "Ravi", "2025-01-06");
        // Week of 31 Aug: Tue 1 and Fri 4 worked; Wed 2 - Thu 3 approved leave (a timesheet also on the 3rd).
        submittedWeek(10L, "2026-08-31");
        approvedDays(10L, "01", "03", "04");
        leave(10L, "2026-09-02", "2026-09-03", "APPROVED");
        // Week of 7 Sep, approved: Mon-Thu worked, Friday 11 left at 0 hours (no paid leave left) = LOP.
        submittedWeek(10L, "2026-09-07");
        approvedDays(10L, "07", "08", "09", "10");
        // Week of 14 Sep: Monday is a holiday; Tue-Fri worked.
        submittedWeek(10L, "2026-09-14");
        approvedDays(10L, "15", "16", "17", "18");
        // Week of 21 Sep, still waiting for HR: Mon-Tue and Thu pending, Wed 0 hours; Fri 25 - Mon 28 approved leave.
        submittedWeek(10L, "2026-09-21");
        for (String d : List.of("21", "22", "24")) {
            timesheet(10L, "2026-09-" + d, "PENDING");
        }
        leave(10L, "2026-09-25", "2026-09-28", "APPROVED");
        // Week of 28 Sep, rejected by HR: Tue 29 has leave waiting; Wed 30's timesheet was rejected.
        submittedWeek(10L, "2026-09-28");
        leave(10L, "2026-09-29", "2026-09-29", "PENDING");
        timesheet(10L, "2026-09-30", "REJECTED");

        SalarySummaryResponse.Row ravi = service(AFTER_MONTH).summary(2026, 9).rows().get(0);

        assertThat(ravi.workingDays()).isEqualTo(21);
        assertThat(ravi.weeklyOffs()).as("8 weekend days, including two inside the leave").isEqualTo(8);
        assertThat(ravi.holidays()).isEqualTo(1);
        assertThat(ravi.presentDays()).as("1, 4, 7-10, 15-18").isEqualTo(10);
        assertThat(ravi.paidLeaveDays()).as("2, 3, 25, 28: weekend days inside leave are not leave").isEqualTo(4);
        assertThat(ravi.absences()).as("only Friday 11: 0 hours in a week HR approved").isEqualTo(1);
        assertThat(ravi.pendingDays()).as("21, 22, 23 (0 hours, week not decided), 24 and 29 (leave waiting)").isEqualTo(5);
        assertThat(ravi.reviewDays()).as("30: rejected timesheet").isEqualTo(1);
        assertThat(ravi.presentDays() + ravi.paidLeaveDays() + ravi.absences() + ravi.pendingDays() + ravi.reviewDays()
                + ravi.notYetDue()).as("no working day counted twice or missed").isEqualTo(ravi.workingDays());
        assertThat(ravi.lopDays()).as("pending and rejected days are never LOP automatically").isEqualTo(1);
        assertThat(ravi.payableDays()).isEqualTo(29);
        assertThat(ravi.complete()).isFalse();
        assertThat(ravi.flags())
                .anyMatch(f -> f.startsWith("1 working day(s) with 0 hours and no paid leave left"))
                .anyMatch(f -> f.startsWith("5 working day(s) waiting for HR"))
                .anyMatch(f -> f.startsWith("1 working day(s) in rejected timesheets"))
                .anyMatch(f -> f.startsWith("1 day(s) have both approved leave and an approved timesheet"));
    }

    @Test
    void anEmployeeWithNoLeaveWhoWorkedNothingAllWeekIsNotLopWithoutASubmission() {
        // No paid leave, nothing submitted for the week of 7 Sep: missing, so HR must look; never LOP on its own.
        employee(10L, "EMP010", "Ravi", "2025-01-06");
        for (String monday : List.of("2026-08-31", "2026-09-14", "2026-09-21", "2026-09-28")) {
            submittedWeek(10L, monday);
        }
        approvedDays(10L, "01", "02", "03", "04", "15", "16", "17", "18", "21", "22", "23", "24", "25", "28", "29", "30");

        SalarySummaryResponse.Row ravi = service(AFTER_MONTH).summary(2026, 9).rows().get(0);

        assertThat(ravi.reviewDays()).as("7-11: no timesheet submitted").isEqualTo(5);
        assertThat(ravi.lopDays()).isZero();
        assertThat(ravi.payableDays()).isEqualTo(30);
        assertThat(ravi.complete()).isFalse();
        assertThat(ravi.flags()).anyMatch(f -> f.startsWith("5 working day(s) with no timesheet submitted"));
    }

    @Test
    void approvedLeaveInAnApprovedWeekIsPaidLeaveNeverLopAndNeverCountedTwice() {
        // Week of 7 Sep: Mon worked, Tue-Thu approved leave (27 h), Fri worked: 9 + 27 + 9 = 45 h, approved by HR.
        employee(10L, "EMP010", "Ravi", "2025-01-06");
        for (String monday : List.of("2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28")) {
            submittedWeek(10L, monday);
        }
        approvedDays(10L, "01", "02", "03", "04", "07", "11", "15", "16", "17", "18",
                "21", "22", "23", "24", "25", "28", "29", "30");
        leave(10L, "2026-09-08", "2026-09-10", "APPROVED");

        SalarySummaryResponse.Row ravi = service(AFTER_MONTH).summary(2026, 9).rows().get(0);

        assertThat(ravi.paidLeaveDays()).isEqualTo(3);
        assertThat(ravi.presentDays()).isEqualTo(18);
        assertThat(ravi.absences()).as("leave days are not 0-hour LOP days").isZero();
        assertThat(ravi.lopDays()).isZero();
        assertThat(ravi.presentDays() + ravi.paidLeaveDays()).as("each working day once").isEqualTo(ravi.workingDays());
        assertThat(ravi.payableDays()).isEqualTo(30);
        assertThat(ravi.complete()).isTrue();
        assertThat(ravi.flags()).noneMatch(f -> f.contains("both approved leave"));
    }

    @Test
    void anEmptyDayWhoseLeaveWasRejectedIsForHrToDecide() {
        employee(10L, "EMP010", "Ravi", "2025-01-06");
        for (String monday : List.of("2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28")) {
            submittedWeek(10L, monday);
        }
        approvedDays(10L, "01", "02", "03", "04", "07", "08", "09", "10", "11", "15", "16", "17", "18",
                "21", "22", "23", "24", "25", "28", "29");
        leave(10L, "2026-09-30", "2026-09-30", "REJECTED");   // 30 left empty while the leave waited; then rejected

        SalarySummaryResponse.Row ravi = service(AFTER_MONTH).summary(2026, 9).rows().get(0);

        assertThat(ravi.lopDays()).isZero();
        assertThat(ravi.reviewDays()).isEqualTo(1);
        assertThat(ravi.flags()).anyMatch(f -> f.contains("whose leave HR rejected"));
    }

    @Test
    void aMidMonthJoinerIsCountedFromTheJoiningDateOnly() {
        employee(20L, "EMP020", "Priya", "2026-09-21");   // Monday 21
        submittedWeek(20L, "2026-09-21");
        submittedWeek(20L, "2026-09-28");
        approvedDays(20L, "21", "22", "23", "24", "25", "28", "29", "30");

        SalarySummaryResponse.Row priya = service(AFTER_MONTH).summary(2026, 9).rows().get(0);

        assertThat(priya.employedDays()).isEqualTo(10);
        assertThat(priya.weeklyOffs()).isEqualTo(2);
        assertThat(priya.holidays()).as("the 14th was before she joined").isZero();
        assertThat(priya.workingDays()).isEqualTo(8);
        assertThat(priya.presentDays()).isEqualTo(8);
        assertThat(priya.lopDays()).as("days before joining are not LOP").isZero();
        assertThat(priya.payableDays()).isEqualTo(10);
        assertThat(priya.complete()).isTrue();
        assertThat(priya.flags()).containsExactly("Joined on 2026-09-21: days before that are not counted.");
    }

    @Test
    void inactiveEmployeesAreListedOnlyWithActivityAndLaterJoinersNotAtAll() {
        Employee left = employee(30L, "EMP030", "Old", "2024-01-01");
        left.deactivate();
        Employee leftThisMonth = employee(31L, "EMP031", "Gone", "2024-01-01");
        leftThisMonth.deactivate();
        timesheet(31L, "2026-09-01", "APPROVED");
        employee(32L, "EMP032", "Next", "2026-10-01");

        SalarySummaryResponse report = service(AFTER_MONTH).summary(2026, 9);

        assertThat(report.rows()).extracting(SalarySummaryResponse.Row::employeeCode).containsExactly("EMP031");
        assertThat(report.rows().get(0).flags()).anyMatch(f -> f.startsWith("Account inactive"));
        assertThat(report.rows().get(0).serialNo()).isEqualTo(1);
    }

    @Test
    void theCurrentMonthIsProvisionalAndFutureDaysAreNotLop() {
        employee(10L, "EMP010", "Ravi", "2025-01-06");
        submittedWeek(10L, "2026-08-31");
        submittedWeek(10L, "2026-09-07");
        approvedDays(10L, "01", "02", "03", "04", "07", "08", "09", "10", "11");
        timesheet(10L, "2026-09-15", "PENDING");   // this week, not decided yet

        SalarySummaryResponse report = service(MID_MONTH).summary(2026, 9);
        SalarySummaryResponse.Row ravi = report.rows().get(0);

        assertThat(report.provisional()).isTrue();
        assertThat(ravi.notYetDue()).as("working days 16-30 after the 15th").isEqualTo(11);
        assertThat(ravi.presentDays()).isEqualTo(9);
        assertThat(ravi.pendingDays()).isEqualTo(1);
        assertThat(ravi.lopDays()).isZero();
        assertThat(ravi.complete()).isFalse();
        assertThat(ravi.flags()).anyMatch(f -> f.startsWith("Month not over"));
    }

    @Test
    void totalsAddUpAndAFutureOrInvalidMonthIsRefused() {
        employee(10L, "EMP010", "Ravi", "2025-01-06");
        employee(20L, "EMP020", "Priya", "2025-01-06");
        for (long id : List.of(10L, 20L)) {
            for (String monday : List.of("2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28")) {
                submittedWeek(id, monday);
            }
        }
        approvedDays(10L, "01", "02", "03", "04", "07", "08", "09", "10", "11", "15", "16", "17", "18",
                "21", "22", "23", "25", "28", "29", "30");   // 24 left at 0 hours: LOP
        approvedDays(20L, "01", "02", "03", "04", "07", "08", "09", "10", "11", "15", "16", "17", "18",
                "21", "22", "23", "24", "25", "28", "29", "30");

        SalarySummaryResponse report = service(AFTER_MONTH).summary(2026, 9);
        assertThat(report.totals().employees()).isEqualTo(2);
        assertThat(report.totals().lopDays()).isEqualTo(1);
        assertThat(report.totals().reviewDays()).isZero();
        assertThat(report.totals().payableDays()).isEqualTo(29 + 30);
        assertThat(report.totals().needsReview()).as("only Ravi has a flag").isEqualTo(1);

        Throwable future = catchThrowable(() -> service(AFTER_MONTH).summary(2026, 11));
        assertThat(((ApiException) future).getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        Throwable bad = catchThrowable(() -> service(AFTER_MONTH).summary(2026, 13));
        assertThat(((ApiException) bad).getField()).isEqualTo("month");
    }
}
