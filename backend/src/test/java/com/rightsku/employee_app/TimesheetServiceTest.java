package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Timesheet rules against the working calendar: schedules, HR schedule
 * changes, holidays and holidays on weekly offs. The real WorkCalendarService
 * is used with mocked repositories, so no database is touched.
 * "Today" is Wednesday 14 October 2026 in India.
 */
class TimesheetServiceTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock CLOCK = Clock.fixed(
            LocalDate.parse("2026-10-14").atTime(10, 0).atZone(INDIA).toInstant(), INDIA);
    private static final BigDecimal EIGHT = new BigDecimal("8");

    private TimesheetEntryRepository entries;
    private EmployeeRepository employees;
    private WorkScheduleRepository schedules;
    private CompanyHolidayRepository holidays;
    private TimesheetService service;
    private final List<CompanyHoliday> holidayRows = new ArrayList<>();

    @BeforeEach
    void setUp() {
        entries = mock(TimesheetEntryRepository.class);
        employees = mock(EmployeeRepository.class);
        schedules = mock(WorkScheduleRepository.class);
        holidays = mock(CompanyHolidayRepository.class);
        WorkCalendarService calendarService = new WorkCalendarService(schedules, holidays, "SATURDAY,SUNDAY", EIGHT);
        service = new TimesheetService(entries, employees, calendarService, CLOCK);

        employee(10L, 110L, "EMP010", null);  // Ravi: company default (Sat + Sun off)
        employee(20L, 120L, "EMP020", null);  // Priya: Friday + Saturday off (set below)

        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(20L)).thenReturn(List.of(
                WorkSchedule.create(20L, d("2026-01-01"), EnumSet.of(DayOfWeek.FRIDAY, DayOfWeek.SATURDAY), EIGHT, 1L)));

        // Holidays: looked up by date range, like the real query.
        when(holidays.findByHolidayDateBetweenOrderByHolidayDateAsc(any(), any())).thenAnswer(call -> {
            LocalDate from = call.getArgument(0);
            LocalDate to = call.getArgument(1);
            return holidayRows.stream().filter(h -> !h.getDate().isBefore(from) && !h.getDate().isAfter(to)).toList();
        });
        holidayRows.add(CompanyHoliday.create(d("2026-10-02"), "Gandhi Jayanti", 1L));    // Friday
        holidayRows.add(CompanyHoliday.create(d("2026-10-03"), "Test weekend holiday", 1L)); // Saturday

        when(entries.saveAndFlush(any(TimesheetEntry.class))).thenAnswer(call -> {
            TimesheetEntry e = call.getArgument(0);
            ReflectionTestUtils.setField(e, "id", 900L);
            return e;
        });
    }

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    private Employee employee(long id, long userId, String code, LocalDate joiningDate) {
        AppUser account = AppUser.create(code, code.toLowerCase() + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", userId);
        Employee e = Employee.create(account, code,
                new Employee.EmployeeDetails("Test", code, null, null, null, joiningDate));
        ReflectionTestUtils.setField(e, "id", id);
        when(employees.findByUser_Id(userId)).thenReturn(Optional.of(e));
        return e;
    }

    private static TimesheetRequest entry(String date, String hours) {
        return new TimesheetRequest(d(date), new BigDecimal(hours), " Built the payslip screen ");
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    /* ---------- Working days ---------- */

    @Test
    void workingDayIsAccepted() {
        TimesheetResponse response = service.submit(110L, entry("2026-10-12", "7.5"));

        assertThat(response.id()).isEqualTo(900L);
        assertThat(response.date()).isEqualTo(d("2026-10-12"));
        assertThat(response.hours()).isEqualByComparingTo("7.50");
        assertThat(response.description()).isEqualTo("Built the payslip screen");
        assertThat(response.status()).isEqualTo("PENDING");
        ArgumentCaptor<TimesheetEntry> saved = ArgumentCaptor.forClass(TimesheetEntry.class);
        verify(entries).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getEmployeeId()).as("always the signed-in employee").isEqualTo(10L);
    }

    @Test
    void weeklyOffIsRefusedByTheServer() {
        Throwable saturday = catchThrowable(() -> service.submit(110L, entry("2026-10-10", "8")));
        assertApiError(saturday, HttpStatus.BAD_REQUEST, "date");
        assertThat(saturday).hasMessageContaining("weekly off");
        verify(entries, never()).saveAndFlush(any());
    }

    @Test
    void holidayIsRefusedByTheServer() {
        Throwable holiday = catchThrowable(() -> service.submit(110L, entry("2026-10-02", "8")));
        assertApiError(holiday, HttpStatus.BAD_REQUEST, "date");
        assertThat(holiday).hasMessageContaining("Gandhi Jayanti");
        verify(entries, never()).saveAndFlush(any());
    }

    @Test
    void holidayOnAWeeklyOffIsRefusedAsAHoliday() {
        Throwable overlap = catchThrowable(() -> service.submit(110L, entry("2026-10-03", "8")));
        assertApiError(overlap, HttpStatus.BAD_REQUEST, "date");
        assertThat(overlap).hasMessageContaining("holiday");
    }

    @Test
    void eachEmployeeFollowsTheirOwnSchedule() {
        // Priya: Friday and Saturday off, Sunday is a working day.
        assertThat(service.submit(120L, entry("2026-10-11", "8")).date()).isEqualTo(d("2026-10-11"));
        assertApiError(catchThrowable(() -> service.submit(120L, entry("2026-10-09", "8"))), HttpStatus.BAD_REQUEST, "date");
        // Ravi (company default): the same Sunday is off, Friday works.
        assertApiError(catchThrowable(() -> service.submit(110L, entry("2026-10-11", "8"))), HttpStatus.BAD_REQUEST, "date");
        assertThat(service.submit(110L, entry("2026-10-09", "8")).date()).isEqualTo(d("2026-10-09"));
    }

    @Test
    void hrScheduleChangeAppliesFromItsStartDate() {
        // HR: from Monday 5 Oct, Ravi works Saturdays (only Sunday off).
        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(10L)).thenReturn(List.of(
                WorkSchedule.create(10L, d("2026-10-05"), EnumSet.of(DayOfWeek.SUNDAY), EIGHT, 1L)));

        assertThat(service.submit(110L, entry("2026-10-10", "8")).date()).as("Saturday after the change")
                .isEqualTo(d("2026-10-10"));
        // A Saturday before the change keeps the old schedule (and 3 Oct is also a holiday).
        assertApiError(catchThrowable(() -> service.submit(110L, entry("2026-09-26", "8"))), HttpStatus.BAD_REQUEST, "date");
    }

    @Test
    void calendarShowsWorkingDaysOffsHolidaysAndOverlap() {
        CalendarResponse calendar = service.calendarMine(110L, d("2026-09-28"), d("2026-10-04"));

        assertThat(calendar.today()).isEqualTo(d("2026-10-14"));
        assertThat(calendar.days()).extracting(CalendarResponse.Day::kind).containsExactly(
                "WORKING", "WORKING", "WORKING", "WORKING", "HOLIDAY", "HOLIDAY", "WEEKLY_OFF");
        CalendarResponse.Day overlap = calendar.days().get(5);
        assertThat(overlap.weeklyOff()).isTrue();
        assertThat(overlap.holidayName()).isEqualTo("Test weekend holiday");
        assertThat(calendar.days().get(4).weeklyOff()).isFalse();
    }

    /* ---------- Dates, hours and duplicates ---------- */

    @Test
    void futureOldAndPreJoiningDatesAreRefused() {
        assertApiError(catchThrowable(() -> service.submit(110L, entry("2026-10-15", "8"))), HttpStatus.BAD_REQUEST, "date");
        assertApiError(catchThrowable(() -> service.submit(110L, entry("2026-08-14", "8"))), HttpStatus.BAD_REQUEST, "date");

        employee(30L, 130L, "EMP030", d("2026-10-13"));
        assertApiError(catchThrowable(() -> service.submit(130L, entry("2026-10-12", "8"))), HttpStatus.BAD_REQUEST, "date");
        assertThat(service.submit(130L, entry("2026-10-13", "8")).date()).isEqualTo(d("2026-10-13"));
    }

    @Test
    void todayIsAllowedInTheCompanyTimeZone() {
        assertThat(service.submit(110L, entry("2026-10-14", "4")).date()).isEqualTo(d("2026-10-14"));
    }

    @Test
    void hoursMustBeQuarterHoursUpToNine() {
        for (String bad : new String[] {"0", "-1", "9.25", "10", "24", "7.1", "0.2"}) {
            assertApiError(catchThrowable(() -> service.submit(110L, entry("2026-10-12", bad))), HttpStatus.BAD_REQUEST, "hours");
        }
        assertThat(service.submit(110L, entry("2026-10-12", "0.25")).hours()).isEqualByComparingTo("0.25");
        assertThat(service.submit(110L, entry("2026-10-13", "9")).hours()).isEqualByComparingTo("9");
    }

    @Test
    void descriptionIsRequired() {
        Throwable thrown = catchThrowable(() ->
                service.submit(110L, new TimesheetRequest(d("2026-10-12"), EIGHT, " \t ")));
        assertApiError(thrown, HttpStatus.BAD_REQUEST, "description");
    }

    @Test
    void oneEntryPerDate() {
        when(entries.existsByEmployeeIdAndWorkDate(10L, d("2026-10-12"))).thenReturn(true);
        assertApiError(catchThrowable(() -> service.submit(110L, entry("2026-10-12", "8"))), HttpStatus.CONFLICT, "date");

        doThrow(new DataIntegrityViolationException("dup")).when(entries).saveAndFlush(any(TimesheetEntry.class));
        assertApiError(catchThrowable(() -> service.submit(110L, entry("2026-10-13", "8"))), HttpStatus.CONFLICT, "date");
    }

    @Test
    void rangesAreCheckedAndUserWithoutEmployeeRecordGetsNotFound() {
        assertApiError(catchThrowable(() -> service.listMine(110L, d("2026-10-10"), d("2026-10-01"))), HttpStatus.BAD_REQUEST, "to");
        assertApiError(catchThrowable(() -> service.calendarMine(110L, d("2026-01-01"), d("2026-12-31"))), HttpStatus.BAD_REQUEST, "to");
        when(employees.findByUser_Id(anyLong())).thenReturn(Optional.empty());
        assertApiError(catchThrowable(() -> service.submit(1L, entry("2026-10-12", "8"))), HttpStatus.NOT_FOUND, null);
    }
}
