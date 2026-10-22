package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * HR timesheet review: one row per employee-week, approve or reject the
 * pending days, counts. Repositories are mocks backed by in-memory lists
 * (the single UPDATE statement is imitated: only PENDING rows change).
 */
class HrTimesheetServiceTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock CLOCK = Clock.fixed(
            LocalDate.parse("2026-10-14").atTime(10, 0).atZone(INDIA).toInstant(), INDIA);
    private static final long HR = 1L;

    private TimesheetEntryRepository entries;
    private EmployeeRepository employees;
    private LeaveRequestRepository leaveRequests;
    private AuditEntryRepository audit;
    private HrTimesheetService service;
    private final List<TimesheetEntry> saved = new ArrayList<>();
    private final List<Employee> people = new ArrayList<>();

    @BeforeEach
    void setUp() {
        entries = mock(TimesheetEntryRepository.class);
        employees = mock(EmployeeRepository.class);
        leaveRequests = mock(LeaveRequestRepository.class);
        audit = mock(AuditEntryRepository.class);
        service = new HrTimesheetService(entries, employees, leaveRequests, audit, CLOCK);

        employee(10L, "EMP010", "Ravi", "Kumar");
        employee(20L, "EMP020", "Priya", "Shah");

        when(entries.findByStatusAndWorkDateGreaterThanEqualOrderByWorkDateDesc(anyString(), any())).thenAnswer(call -> {
            String status = call.getArgument(0);
            LocalDate from = call.getArgument(1);
            return saved.stream().filter(e -> e.getStatus().equals(status) && !e.getWorkDate().isBefore(from))
                    .sorted(Comparator.comparing(TimesheetEntry::getWorkDate).reversed()).toList();
        });
        when(entries.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(anyLong(), any(), any())).thenAnswer(call -> {
            long id = call.getArgument(0);
            LocalDate from = call.getArgument(1);
            LocalDate to = call.getArgument(2);
            return saved.stream().filter(e -> e.getEmployeeId() == id && !e.getWorkDate().isBefore(from) && !e.getWorkDate().isAfter(to))
                    .toList();
        });
        // Imitates the single UPDATE ... WHERE status = 'PENDING'.
        when(entries.reviewPending(anyLong(), any(), any(), anyString(), any(), any(), any())).thenAnswer(call -> {
            long id = call.getArgument(0);
            LocalDate from = call.getArgument(1);
            LocalDate to = call.getArgument(2);
            int changed = 0;
            for (TimesheetEntry e : saved) {
                if (e.getEmployeeId() == id && !e.getWorkDate().isBefore(from) && !e.getWorkDate().isAfter(to)
                        && e.getStatus().equals("PENDING")) {
                    ReflectionTestUtils.setField(e, "status", call.getArgument(3));
                    ReflectionTestUtils.setField(e, "reviewedBy", call.getArgument(4));
                    ReflectionTestUtils.setField(e, "reviewedAt", call.getArgument(5));
                    ReflectionTestUtils.setField(e, "reviewNote", call.getArgument(6));
                    changed++;
                }
            }
            return changed;
        });
    }

    private void employee(long id, String code, String first, String last) {
        AppUser account = AppUser.create(code, code.toLowerCase() + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        Employee e = Employee.create(account, code, new Employee.EmployeeDetails(first, last, null, null, null, null));
        ReflectionTestUtils.setField(e, "id", id);
        people.add(e);
        when(employees.findById(id)).thenReturn(Optional.of(e));
        when(employees.findAllById(any())).thenAnswer(call -> {
            Collection<Long> ids = call.getArgument(0);
            return people.stream().filter(p -> ids.contains(p.getId())).toList();
        });
    }

    private void entry(long employeeId, String date, String hours) {
        TimesheetEntry e = TimesheetEntry.submit(employeeId, LocalDate.parse(date), new BigDecimal(hours), "Work on " + date);
        ReflectionTestUtils.setField(e, "id", 900L + saved.size());
        ReflectionTestUtils.setField(e, "createdAt", Instant.parse(date + "T12:00:00Z"));
        saved.add(e);
    }

    private static TimesheetReviewRequest review(long employeeId, String monday, String decision, String note) {
        return new TimesheetReviewRequest(employeeId, LocalDate.parse(monday), decision, note);
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    @Test
    void submittedTimesheetsAppearAsOneRowPerEmployeeWeek() {
        for (String day : new String[] {"2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"}) {
            entry(10L, day, "9");
        }
        entry(20L, "2026-10-12", "8");   // a day from the older one-day submit
        entry(20L, "2026-10-13", "7.5");

        List<HrTimesheetWeekResponse> weeks = service.weeks(null);

        assertThat(weeks).hasSize(2);
        HrTimesheetWeekResponse priya = weeks.get(0);   // newest week first
        assertThat(priya.employeeName()).isEqualTo("Priya Shah");
        assertThat(priya.employeeCode()).isEqualTo("EMP020");
        assertThat(priya.weekStart()).isEqualTo(LocalDate.parse("2026-10-12"));
        assertThat(priya.weekEnd()).isEqualTo(LocalDate.parse("2026-10-18"));
        assertThat(priya.totalHours()).isEqualByComparingTo("15.5");
        assertThat(priya.status()).isEqualTo("PENDING");
        assertThat(priya.submittedAt()).isEqualTo(Instant.parse("2026-10-13T12:00:00Z"));
        HrTimesheetWeekResponse ravi = weeks.get(1);
        assertThat(ravi.employeeName()).isEqualTo("Ravi Kumar");
        assertThat(ravi.totalHours()).isEqualByComparingTo("45");
        assertThat(ravi.days()).extracting(TimesheetResponse::date).first().isEqualTo(LocalDate.parse("2026-10-05"));
    }

    @Test
    void approvingAWeekApprovesOnlyItsPendingDaysAndIsAudited() {
        entry(10L, "2026-10-05", "9");
        entry(10L, "2026-10-06", "9");
        entry(10L, "2026-10-12", "9");   // next week: untouched

        HrTimesheetWeekResponse result = service.review(review(10L, "2026-10-05", "approve", null), HR);

        assertThat(result.status()).isEqualTo("APPROVED");
        assertThat(result.days()).hasSize(2);
        assertThat(saved).filteredOn(e -> e.getStatus().equals("APPROVED")).hasSize(2);
        assertThat(saved.get(2).getStatus()).isEqualTo("PENDING");
        assertThat(saved.get(0).getReviewedBy()).isEqualTo(HR);
        assertThat(service.weeks("PENDING")).hasSize(1);
        ArgumentCaptor<AuditEntry> logged = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(logged.capture());
        assertThat(logged.getValue().getAction()).isEqualTo("TIMESHEET_APPROVED");
        assertThat(logged.getValue().getEntityId()).isEqualTo("EMP010/2026-10-05");
    }

    @Test
    void rejectingAWeekKeepsTheNoteForTheEmployee() {
        entry(20L, "2026-10-12", "8");

        HrTimesheetWeekResponse result = service.review(review(20L, "2026-10-12", "REJECT", "  Wrong project code "), HR);

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(saved.get(0).getStatus()).isEqualTo("REJECTED");
        assertThat(TimesheetResponse.from(saved.get(0)).remark()).isEqualTo("Wrong project code");
        assertThat(service.weeks("REJECTED")).singleElement()
                .satisfies(w -> assertThat(w.reviewNote()).isEqualTo("Wrong project code"));
    }

    @Test
    void aWeekCanOnlyBeDecidedOnce() {
        entry(10L, "2026-10-05", "9");
        service.review(review(10L, "2026-10-05", "APPROVE", null), HR);

        Throwable again = catchThrowable(() -> service.review(review(10L, "2026-10-05", "REJECT", null), HR));

        assertApiError(again, HttpStatus.CONFLICT, null);
        assertThat(saved.get(0).getStatus()).isEqualTo("APPROVED");
    }

    @Test
    void badRequestsChangeNothing() {
        entry(10L, "2026-10-05", "9");
        assertApiError(catchThrowable(() -> service.review(review(10L, "2026-10-05", "MAYBE", null), HR)), HttpStatus.BAD_REQUEST, "decision");
        assertApiError(catchThrowable(() -> service.review(review(10L, "2026-10-06", "APPROVE", null), HR)), HttpStatus.BAD_REQUEST, "weekStart");
        when(employees.findById(99L)).thenReturn(Optional.empty());
        assertApiError(catchThrowable(() -> service.review(review(99L, "2026-10-05", "APPROVE", null), HR)), HttpStatus.NOT_FOUND, null);
        assertApiError(catchThrowable(() -> service.weeks("DONE")), HttpStatus.BAD_REQUEST, "status");
        verify(entries, never()).reviewPending(anyLong(), any(), any(), anyString(), any(), any(), any());
        verify(audit, never()).save(any());
        assertThat(saved.get(0).getStatus()).isEqualTo("PENDING");
    }

    @Test
    void countsComeFromTheDatabase() {
        when(entries.countWeeksByStatus()).thenReturn(List.of(new Object[] {"PENDING", 3L}, new Object[] {"APPROVED", 7L}));
        when(leaveRequests.countByStatusGrouped()).thenReturn(List.<Object[]>of(new Object[] {"REJECTED", 2L}));

        ApprovalSummaryResponse summary = service.summary();

        assertThat(summary.timesheets()).isEqualTo(new ApprovalSummaryResponse.Counts(3, 7, 0));
        assertThat(summary.leave()).isEqualTo(new ApprovalSummaryResponse.Counts(0, 0, 2));
        verify(entries).countWeeksByStatus();
        verify(leaveRequests).countByStatusGrouped();
        verify(entries, never()).findByStatusAndWorkDateGreaterThanEqualOrderByWorkDateDesc(eq("PENDING"), any());
    }
}
