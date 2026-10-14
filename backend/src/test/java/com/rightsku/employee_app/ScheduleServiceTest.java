package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
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
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/** HR schedule changes. Repositories are mocked: no database. "Today" is 14 Oct 2026. */
class ScheduleServiceTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock CLOCK = Clock.fixed(
            LocalDate.parse("2026-10-14").atTime(10, 0).atZone(INDIA).toInstant(), INDIA);
    private static final Long HR = 1L;

    private WorkScheduleRepository schedules;
    private EmployeeRepository employees;
    private AuditEntryRepository audit;
    private ScheduleService service;
    private final List<WorkSchedule> rows = new ArrayList<>();

    @BeforeEach
    void setUp() {
        schedules = mock(WorkScheduleRepository.class);
        employees = mock(EmployeeRepository.class);
        audit = mock(AuditEntryRepository.class);
        WorkCalendarService calendarService = new WorkCalendarService(
                schedules, mock(CompanyHolidayRepository.class), "SATURDAY,SUNDAY", new BigDecimal("8"));
        service = new ScheduleService(schedules, employees, calendarService, audit, CLOCK);

        AppUser account = AppUser.create("EMP010", "ravi@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        Employee ravi = Employee.create(account, "EMP010", new Employee.EmployeeDetails("Ravi", "Kumar", null, null, null, null));
        ReflectionTestUtils.setField(ravi, "id", 10L);
        when(employees.findById(10L)).thenReturn(Optional.of(ravi));

        // A tiny in-memory stand-in for the schedule table.
        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(10L)).thenAnswer(call ->
                rows.stream().sorted((a, b) -> a.getEffectiveFrom().compareTo(b.getEffectiveFrom())).toList());
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

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
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
    void hrSetsScheduleThatAppliesToday() {
        ScheduleResponse response = service.set(10L,
                new ScheduleRequest(List.of("sunday"), new BigDecimal("9"), d("2026-10-14")), HR);

        assertThat(response.current().effectiveFrom()).isEqualTo(d("2026-10-14"));
        assertThat(response.current().weeklyOffs()).containsExactly("SUNDAY");
        assertThat(response.current().hoursPerDay()).isEqualByComparingTo("9.00");
        assertThat(response.upcoming()).isEmpty();
        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("SCHEDULE_CHANGED");
        assertThat(entry.getValue().getEntityId()).isEqualTo("EMP010");
    }

    @Test
    void futureChangeIsUpcomingAndDoesNotChangeTodaysSchedule() {
        service.set(10L, new ScheduleRequest(List.of("SUNDAY"), new BigDecimal("8"), d("2026-10-14")), HR);
        ScheduleResponse response = service.set(10L,
                new ScheduleRequest(List.of("FRIDAY", "SATURDAY"), new BigDecimal("8"), d("2026-11-01")), HR);

        assertThat(response.current().weeklyOffs()).containsExactly("SUNDAY");
        assertThat(response.upcoming()).extracting(ScheduleResponse.View::effectiveFrom).containsExactly(d("2026-11-01"));
        assertThat(response.upcoming().get(0).weeklyOffs()).containsExactly("FRIDAY", "SATURDAY");
        assertThat(response.saved()).extracting(ScheduleResponse.View::effectiveFrom)
                .containsExactly(d("2026-11-01"), d("2026-10-14"));
    }

    @Test
    void savingAgainForTheSameStartDateReplacesIt() {
        service.set(10L, new ScheduleRequest(List.of("SUNDAY"), new BigDecimal("8"), d("2026-10-20")), HR);
        ScheduleResponse response = service.set(10L,
                new ScheduleRequest(List.of(), new BigDecimal("6.5"), d("2026-10-20")), HR);

        assertThat(rows).hasSize(1);
        assertThat(response.upcoming()).hasSize(1);
        assertThat(response.upcoming().get(0).weeklyOffs()).isEmpty();
        assertThat(response.upcoming().get(0).hoursPerDay()).isEqualByComparingTo("6.5");
    }

    @Test
    void invalidSchedulesAreRefused() {
        List<String> everyDay = EnumSet.allOf(DayOfWeek.class).stream().map(DayOfWeek::name).toList();
        assertApiError(catchThrowable(() -> service.set(10L,
                new ScheduleRequest(everyDay, new BigDecimal("8"), d("2026-10-20")), HR)), HttpStatus.BAD_REQUEST, "weeklyOffs");
        assertApiError(catchThrowable(() -> service.set(10L,
                new ScheduleRequest(List.of("FUNDAY"), new BigDecimal("8"), d("2026-10-20")), HR)), HttpStatus.BAD_REQUEST, "weeklyOffs");
        for (String hours : new String[] {"0", "24.5", "7.2"}) {
            assertApiError(catchThrowable(() -> service.set(10L,
                    new ScheduleRequest(List.of("SUNDAY"), new BigDecimal(hours), d("2026-10-20")), HR)),
                    HttpStatus.BAD_REQUEST, "hoursPerDay");
        }
        assertApiError(catchThrowable(() -> service.set(99L,
                new ScheduleRequest(List.of("SUNDAY"), new BigDecimal("8"), d("2026-10-20")), HR)), HttpStatus.NOT_FOUND, null);
        verify(schedules, never()).saveAndFlush(any());
    }

    @Test
    void startDateInThePastIsRefusedSoPastDaysNeverChange() {
        Throwable thrown = catchThrowable(() -> service.set(10L,
                new ScheduleRequest(List.of("SUNDAY"), new BigDecimal("8"), d("2026-10-13")), HR));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "effectiveFrom");
        verify(schedules, never()).saveAndFlush(any());
        // Today is allowed.
        assertThat(service.set(10L, new ScheduleRequest(List.of("SUNDAY"), new BigDecimal("8"), d("2026-10-14")), HR)
                .current().effectiveFrom()).isEqualTo(d("2026-10-14"));
    }
}
