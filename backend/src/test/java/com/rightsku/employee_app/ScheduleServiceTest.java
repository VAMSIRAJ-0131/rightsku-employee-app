package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * HR schedule changes. Repositories are mocked: no database.
 * "Today" is Wednesday 14 Oct 2026, so this week's Monday is 12 Oct.
 * Company default: Saturday and Sunday off, 8 hours.
 */
class ScheduleServiceTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock CLOCK = Clock.fixed(
            LocalDate.parse("2026-10-14").atTime(10, 0).atZone(INDIA).toInstant(), INDIA);
    private static final Long HR = 1L;

    private WorkScheduleRepository schedules;
    private EmployeeRepository employees;
    private TimesheetWeekRepository weeks;
    private TimesheetEntryRepository entries;
    private LeaveRequestRepository leaveRequests;
    private CompOffRequestRepository compOffRequests;
    private NotificationRepository notificationRows;
    private AuditEntryRepository audit;
    private WorkCalendarService calendarService;
    private ScheduleService service;
    private Employee ravi;
    private final List<WorkSchedule> rows = new ArrayList<>();

    @BeforeEach
    void setUp() {
        schedules = mock(WorkScheduleRepository.class);
        employees = mock(EmployeeRepository.class);
        weeks = mock(TimesheetWeekRepository.class);
        entries = mock(TimesheetEntryRepository.class);
        leaveRequests = mock(LeaveRequestRepository.class);
        compOffRequests = mock(CompOffRequestRepository.class);
        notificationRows = mock(NotificationRepository.class);
        audit = mock(AuditEntryRepository.class);
        calendarService = new WorkCalendarService(
                schedules, mock(CompanyHolidayRepository.class), "SATURDAY,SUNDAY", new BigDecimal("8"));
        service = new ScheduleService(schedules, employees, calendarService, weeks, entries, leaveRequests,
                compOffRequests, new NotificationService(notificationRows, CLOCK), audit, CLOCK);

        AppUser account = AppUser.create("EMP010", "ravi@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", 110L);
        ravi = Employee.create(account, "EMP010", new Employee.EmployeeDetails("Ravi", "Kumar", null, null, null, null));
        ReflectionTestUtils.setField(ravi, "id", 10L);
        ReflectionTestUtils.setField(ravi, "joiningDate", d("2026-09-02")); // a Wednesday: joining week starts 31 Aug
        when(employees.findById(10L)).thenReturn(Optional.of(ravi));
        when(employees.lockById(10L)).thenReturn(Optional.of(ravi));

        // A tiny in-memory stand-in for the schedule table.
        // Like the real query: schedules in force only (not replaced), oldest first.
        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(10L)).thenAnswer(call -> rows.stream()
                .filter(r -> !r.isReplaced())
                .sorted((a, b) -> a.getEffectiveFrom().compareTo(b.getEffectiveFrom())).toList());
        when(schedules.findByEmployeeIdAndEffectiveFrom(any(), any())).thenAnswer(call ->
                rows.stream().filter(r -> r.getEffectiveFrom().equals(call.getArgument(1))).findFirst());
        when(schedules.saveAndFlush(any(WorkSchedule.class))).thenAnswer(call -> {
            WorkSchedule s = call.getArgument(0);
            if (!rows.contains(s)) {
                rows.add(s);
            }
            return s;
        });
    }

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    private ScheduleResponse set(List<String> offs, String hours, String start) {
        return service.set(10L, new ScheduleRequest(offs, new BigDecimal(hours), d(start)), HR);
    }

    private Throwable refused(List<String> offs, String start) {
        return catchThrowable(() -> set(offs, "9", start));
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    private List<Notification> sentNotifications() {
        ArgumentCaptor<Notification> sent = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRows, org.mockito.Mockito.atLeast(0)).save(sent.capture());
        return sent.getAllValues();
    }

    private static LeaveRequest leave(String status, String start, String end, String days) {
        LeaveRequest r = LeaveRequest.apply(10L, LeaveType.CASUAL, d(start), d(end), new BigDecimal(days), "Family");
        ReflectionTestUtils.setField(r, "status", status);
        return r;
    }

    private static CompOffRequest compOff(String status, String day) {
        CompOffRequest r = CompOffRequest.apply(10L, d(day), new BigDecimal("1.0"), "Release support");
        ReflectionTestUtils.setField(r, "status", status);
        return r;
    }

    @Test
    void employeeWithoutScheduleShowsCompanyDefault() {
        ScheduleResponse response = service.get(10L);

        assertThat(response.current().companyDefault()).isTrue();
        assertThat(response.current().weeklyOffs()).containsExactly("SATURDAY", "SUNDAY");
        assertThat(response.current().hoursPerDay()).isEqualByComparingTo("8");
        assertThat(response.saved()).isEmpty();
    }

    @Test
    void hrSetsTuesdayWednesdayOffFromThisWeeksMondayAndTheEmployeeIsNotified() {
        ScheduleResponse response = set(List.of("tuesday", "WEDNESDAY"), "9", "2026-10-12");

        assertThat(response.current().effectiveFrom()).isEqualTo(d("2026-10-12"));
        assertThat(response.current().weeklyOffs()).containsExactly("TUESDAY", "WEDNESDAY");
        assertThat(response.current().hoursPerDay()).isEqualByComparingTo("9.00");
        // The whole week follows the new schedule: Saturday and Sunday are working days.
        WorkCalendar calendar = calendarService.calendarFor(10L, d("2026-10-12"), d("2026-10-18"));
        assertThat(calendar.days(d("2026-10-12"), d("2026-10-18")))
                .extracting(WorkCalendar.Day::kind)
                .containsExactly(WorkCalendar.DayKind.WORKING, WorkCalendar.DayKind.WEEKLY_OFF, WorkCalendar.DayKind.WEEKLY_OFF,
                        WorkCalendar.DayKind.WORKING, WorkCalendar.DayKind.WORKING, WorkCalendar.DayKind.WORKING,
                        WorkCalendar.DayKind.WORKING);

        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("SCHEDULE_CHANGED");
        assertThat(entry.getValue().getEntityId()).isEqualTo("EMP010");

        List<Notification> sent = sentNotifications();
        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).getUserId()).isEqualTo(110L);
        assertThat(sent.get(0).getType()).isEqualTo(Notification.SCHEDULE_CHANGED);
        assertThat(sent.get(0).getMessage())
                .isEqualTo("From Monday 12 Oct 2026: Tuesday and Wednesday off, 9 hours a working day.");
    }

    @Test
    void futureChangeIsUpcomingAndDoesNotChangeTodaysSchedule() {
        set(List.of("FRIDAY", "SUNDAY"), "8", "2026-10-12");
        ScheduleResponse response = set(List.of("FRIDAY", "SATURDAY"), "8", "2026-11-02");

        assertThat(response.current().weeklyOffs()).containsExactly("FRIDAY", "SUNDAY");
        assertThat(response.upcoming()).extracting(ScheduleResponse.View::effectiveFrom).containsExactly(d("2026-11-02"));
        assertThat(response.upcoming().get(0).weeklyOffs()).containsExactly("FRIDAY", "SATURDAY");
        assertThat(response.saved()).extracting(ScheduleResponse.View::effectiveFrom)
                .containsExactly(d("2026-11-02"), d("2026-10-12"));
    }

    @Test
    void earlierSchedulesAreKeptWhenALaterOneIsAdded() {
        set(List.of("FRIDAY", "SUNDAY"), "8", "2026-09-28");
        set(List.of("TUESDAY", "WEDNESDAY"), "9", "2026-10-12");

        WorkCalendar calendar = calendarService.calendarFor(10L, d("2026-09-28"), d("2026-10-18"));
        // Before 12 Oct: Sunday only (Tuesday 6 Oct was a working day, Saturday 10 Oct too).
        assertThat(calendar.day(d("2026-10-06")).working()).isTrue();
        assertThat(calendar.day(d("2026-10-10")).working()).isTrue();
        assertThat(calendar.day(d("2026-10-11")).kind()).isEqualTo(WorkCalendar.DayKind.WEEKLY_OFF);
        // From 12 Oct: Tuesday and Wednesday off.
        assertThat(calendar.day(d("2026-10-13")).kind()).isEqualTo(WorkCalendar.DayKind.WEEKLY_OFF);
        assertThat(rows).hasSize(2);
    }

    @Test
    void savingAgainForTheSameStartDateReplacesItAndOnlyARealChangeNotifies() {
        set(List.of("FRIDAY", "SUNDAY"), "8", "2026-10-19");
        ScheduleResponse response = set(List.of("MONDAY", "SUNDAY"), "6.5", "2026-10-19");
        set(List.of("SUNDAY", "MONDAY"), "6.5", "2026-10-19"); // the same again: nothing new to tell the employee

        assertThat(rows).hasSize(1);
        assertThat(response.upcoming()).hasSize(1);
        assertThat(response.upcoming().get(0).weeklyOffs()).containsExactly("MONDAY", "SUNDAY");
        assertThat(response.upcoming().get(0).hoursPerDay()).isEqualByComparingTo("6.5");
        assertThat(sentNotifications()).hasSize(2);
        assertThat(sentNotifications().get(1).getMessage())
                .isEqualTo("From Monday 19 Oct 2026: Monday and Sunday off, 6.5 hours a working day.");
    }

    @Test
    void invalidSchedulesAreRefused() {
        List<String> everyDay = EnumSet.allOf(DayOfWeek.class).stream().map(DayOfWeek::name).toList();
        assertApiError(refused(everyDay, "2026-10-19"), HttpStatus.BAD_REQUEST, "weeklyOffs");
        assertApiError(refused(List.of("FUNDAY"), "2026-10-19"), HttpStatus.BAD_REQUEST, "weeklyOffs");
        for (String hours : new String[] {"0", "24.5", "7.2"}) {
            assertApiError(catchThrowable(() -> set(List.of("FRIDAY", "SUNDAY"), hours, "2026-10-19")),
                    HttpStatus.BAD_REQUEST, "hoursPerDay");
        }
        assertApiError(catchThrowable(() -> service.set(99L,
                new ScheduleRequest(List.of("FRIDAY", "SUNDAY"), new BigDecimal("8"), d("2026-10-19")), HR)), HttpStatus.NOT_FOUND, null);
        verify(schedules, never()).saveAndFlush(any());
        assertThat(sentNotifications()).isEmpty();
    }

    @Test
    void everyPairOfTwoDifferentDaysIsAcceptedAndSavedAsIs() {
        List<DayOfWeek> days = List.of(DayOfWeek.values());
        int pairs = 0;
        for (int i = 0; i < days.size(); i++) {
            for (int j = i + 1; j < days.size(); j++) {
                rows.clear();
                ScheduleResponse saved = set(List.of(days.get(i).name(), days.get(j).name()), "9", "2026-10-19");
                assertThat(saved.upcoming().get(0).weeklyOffs()).as(days.get(i) + "+" + days.get(j))
                        .containsExactly(days.get(i).name(), days.get(j).name());
                // Read back as the calendar sees it: exactly those two days off, the other five working.
                WorkCalendar calendar = calendarService.calendarFor(10L, d("2026-10-19"), d("2026-10-25"));
                assertThat(calendar.days(d("2026-10-19"), d("2026-10-25")).stream().filter(WorkCalendar.Day::working))
                        .hasSize(5);
                pairs++;
            }
        }
        assertThat(pairs).isEqualTo(21);
    }

    @Test
    void exactlyTwoWeeklyOffsAreRequired() {
        for (List<String> offs : List.of(List.<String>of(), List.of("SUNDAY"), List.of("SUNDAY", "SUNDAY"),
                List.of("MONDAY", "TUESDAY", "WEDNESDAY"))) {
            Throwable thrown = refused(offs, "2026-10-19");
            assertApiError(thrown, HttpStatus.BAD_REQUEST, "weeklyOffs");
            assertThat(thrown).as(offs.toString()).hasMessage("Choose exactly two weekly off days.");
        }
        verify(schedules, never()).saveAndFlush(any());
    }

    @Test
    void savingFromAMondayReplacesLaterSchedulesButKeepsThemForHistory() {
        set(List.of("FRIDAY", "SATURDAY"), "9", "2026-11-02");   // planned earlier
        set(List.of("TUESDAY", "WEDNESDAY"), "9", "2026-10-19"); // now: Tue/Wed from 19 Oct on

        WorkSchedule planned = rows.stream().filter(r -> r.getEffectiveFrom().equals(d("2026-11-02"))).findFirst().orElseThrow();
        assertThat(planned.isReplaced()).isTrue();
        assertThat(rows).hasSize(2); // nothing deleted
        WorkCalendar calendar = calendarService.calendarFor(10L, d("2026-10-19"), d("2026-11-08"));
        assertThat(calendar.day(d("2026-11-03")).kind()).as("Tuesday 3 Nov").isEqualTo(WorkCalendar.DayKind.WEEKLY_OFF);
        assertThat(calendar.day(d("2026-11-06")).working()).as("Friday 6 Nov").isTrue();

        // Saving the replaced date again brings it back.
        set(List.of("FRIDAY", "SATURDAY"), "9", "2026-11-02");
        assertThat(planned.isReplaced()).isFalse();
    }

    @Test
    void anOldScheduleStartingOnASaturdayIsReplacedByASaveFromThatWeeksMonday() {
        // Saved before the Monday rule (10007's data): Tue/Wed from Saturday 24 Oct.
        WorkSchedule old = WorkSchedule.create(10L, d("2026-10-24"),
                EnumSet.of(DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY), new BigDecimal("9"), HR);
        rows.add(old);

        set(List.of("TUESDAY", "WEDNESDAY"), "9", "2026-10-19");

        assertThat(old.isReplaced()).isTrue();
        WorkCalendar calendar = calendarService.calendarFor(10L, d("2026-10-19"), d("2026-10-25"));
        assertThat(calendar.days(d("2026-10-19"), d("2026-10-25"))).extracting(WorkCalendar.Day::working)
                .containsExactly(true, false, false, true, true, true, true);
    }

    @Test
    void aScheduleMustStartOnAMonday() {
        for (String notMonday : new String[] {"2026-10-14", "2026-10-18", "2026-11-01"}) {
            Throwable thrown = refused(List.of("FRIDAY", "SUNDAY"), notMonday);
            assertApiError(thrown, HttpStatus.BAD_REQUEST, "effectiveFrom");
        }
        assertThat(refused(List.of("FRIDAY", "SUNDAY"), "2026-10-14")).hasMessageContaining("Choose Monday 12 Oct 2026");
        verify(schedules, never()).saveAndFlush(any());
    }

    @Test
    void pastMondaysAreAllowedBackToTheJoiningWeekOnly() {
        // Joined Wednesday 2 Sep: the joining week starts Monday 31 Aug.
        Throwable before = refused(List.of("FRIDAY", "SUNDAY"), "2026-08-24");
        assertApiError(before, HttpStatus.BAD_REQUEST, "effectiveFrom");
        assertThat(before).hasMessageContaining("31 Aug 2026");
        assertThat(set(List.of("FRIDAY", "SUNDAY"), "9", "2026-08-31").saved()).hasSize(1);
    }

    @Test
    void withoutAJoiningDateTheEarliestStartIsThisWeeksMonday() {
        ReflectionTestUtils.setField(ravi, "joiningDate", null);

        assertApiError(refused(List.of("FRIDAY", "SUNDAY"), "2026-10-05"), HttpStatus.BAD_REQUEST, "effectiveFrom");
        assertThat(set(List.of("FRIDAY", "SUNDAY"), "9", "2026-10-12").current().effectiveFrom()).isEqualTo(d("2026-10-12"));
    }

    @Test
    void aSubmittedTimesheetWeekFromTheStartOnBlocksTheChange() {
        TimesheetWeek submitted = TimesheetWeek.start(10L, d("2026-10-05"));
        when(weeks.findFirstByEmployeeIdAndStatusAndWeekStartGreaterThanEqualOrderByWeekStartAsc(
                eq(10L), eq(TimesheetWeek.STATUS_SUBMITTED), any())).thenAnswer(call ->
                ((LocalDate) call.getArgument(2)).isAfter(d("2026-10-05")) ? Optional.empty() : Optional.of(submitted));

        Throwable thrown = refused(List.of("TUESDAY", "WEDNESDAY"), "2026-09-28");
        assertApiError(thrown, HttpStatus.CONFLICT, "effectiveFrom");
        assertThat(thrown).hasMessageContaining("week of 5 Oct 2026 is already submitted");
        verify(schedules, never()).saveAndFlush(any());
        assertThat(sentNotifications()).isEmpty();

        // From the next Monday on, nothing is submitted: allowed.
        assertThat(set(List.of("TUESDAY", "WEDNESDAY"), "9", "2026-10-12").saved()).hasSize(1);
    }

    @Test
    void submittedTimesheetDaysFromTheStartOnBlockTheChange() {
        TimesheetEntry entry = mock(TimesheetEntry.class);
        when(entry.getWorkDate()).thenReturn(d("2026-10-07"));
        when(entries.findFirstByEmployeeIdAndWorkDateGreaterThanEqualOrderByWorkDateAsc(10L, d("2026-10-05")))
                .thenReturn(Optional.of(entry));

        Throwable thrown = refused(List.of("FRIDAY", "SUNDAY"), "2026-10-05");
        assertApiError(thrown, HttpStatus.CONFLICT, "effectiveFrom");
        assertThat(thrown).hasMessageContaining("7 Oct 2026");
    }

    @Test
    void pendingOrApprovedLeaveWhoseWorkingDaysWouldChangeBlocksTheChange() {
        // Casual leave Tue 20 - Wed 21 Oct: 2 working days under the default schedule.
        when(leaveRequests.activeEndingOnOrAfter(eq(10L), any()))
                .thenReturn(List.of(leave(LeaveRequest.STATUS_PENDING, "2026-10-20", "2026-10-21", "2")));

        Throwable thrown = refused(List.of("TUESDAY", "WEDNESDAY"), "2026-10-19");
        assertApiError(thrown, HttpStatus.CONFLICT, "effectiveFrom");
        assertThat(thrown).hasMessageContaining("Casual leave from 20 Oct 2026 to 21 Oct 2026 is pending");
        verify(schedules, never()).saveAndFlush(any());
    }

    @Test
    void leaveWhoseDaysStayTheSameDoesNotBlock() {
        // Approved leave on Monday 19 Oct only: Monday stays a working day.
        when(leaveRequests.activeEndingOnOrAfter(eq(10L), any()))
                .thenReturn(List.of(leave(LeaveRequest.STATUS_APPROVED, "2026-10-19", "2026-10-19", "1")));

        assertThat(set(List.of("TUESDAY", "WEDNESDAY"), "9", "2026-10-19").upcoming()).hasSize(1);
    }

    @Test
    void aCompOffDayThatWouldBecomeAWorkingDayBlocksTheChange() {
        // Approved Comp-Off for Saturday 10 Oct (a weekly off under the default schedule).
        when(compOffRequests.activeFrom(eq(10L), any()))
                .thenReturn(List.of(compOff(CompOffRequest.STATUS_APPROVED, "2026-10-10")));

        Throwable thrown = refused(List.of("FRIDAY", "SUNDAY"), "2026-10-05");
        assertApiError(thrown, HttpStatus.CONFLICT, "effectiveFrom");
        assertThat(thrown).hasMessageContaining("Comp-Off request is for 10 Oct 2026");

        // Keeping Saturday off is fine.
        assertThat(set(List.of("SATURDAY", "SUNDAY"), "9", "2026-10-05").saved()).hasSize(1);
    }

    @Test
    void conflictChecksRunUnderTheEmployeeLock() {
        set(List.of("FRIDAY", "SUNDAY"), "9", "2026-10-19");
        verify(employees, times(1)).lockById(10L);
    }
}
