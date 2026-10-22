package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Leave balances and requests. Repositories are mocks backed by in-memory
 * lists; the real WorkCalendarService decides working days. No database.
 * "Today" is Wednesday 14 October 2026; Ravi has the company default
 * schedule (Saturday and Sunday off); Friday 23 October is a holiday.
 */
class LeaveServiceTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock CLOCK = Clock.fixed(
            LocalDate.parse("2026-10-14").atTime(10, 0).atZone(INDIA).toInstant(), INDIA);
    private static final long HR = 1L;

    private LeaveBalanceRepository balances;
    private LeaveRequestRepository requests;
    private EmployeeRepository employees;
    private AuditEntryRepository audit;
    private LeaveBalanceAdjustmentRepository adjustments;
    private AppUserRepository users;
    private LeaveService service;
    private CompOffService compOff;
    private final List<LeaveBalance> savedBalances = new ArrayList<>();
    private final List<LeaveRequest> savedRequests = new ArrayList<>();
    private final List<LeaveBalanceAdjustment> savedAdjustments = new ArrayList<>();
    private final List<Employee> people = new ArrayList<>();
    private Employee ravi;

    @BeforeEach
    void setUp() {
        balances = mock(LeaveBalanceRepository.class);
        requests = mock(LeaveRequestRepository.class);
        employees = mock(EmployeeRepository.class);
        audit = mock(AuditEntryRepository.class);
        WorkScheduleRepository schedules = mock(WorkScheduleRepository.class);
        CompanyHolidayRepository holidays = mock(CompanyHolidayRepository.class);
        List<CompanyHoliday> holidayRows = List.of(CompanyHoliday.create(d("2026-10-23"), "Test holiday", HR));
        when(holidays.findByHolidayDateBetweenOrderByHolidayDateAsc(any(), any())).thenAnswer(call -> {
            LocalDate from = call.getArgument(0);
            LocalDate to = call.getArgument(1);
            return holidayRows.stream().filter(h -> !h.getDate().isBefore(from) && !h.getDate().isAfter(to)).toList();
        });
        WorkCalendarService calendar = new WorkCalendarService(schedules, holidays, "SATURDAY,SUNDAY", new BigDecimal("9"));
        adjustments = mock(LeaveBalanceAdjustmentRepository.class);
        users = mock(AppUserRepository.class);
        service = new LeaveService(balances, requests, employees, calendar, audit, adjustments, CLOCK);
        compOff = new CompOffService(balances, requests, adjustments, employees, users, audit);

        // HR (user 1) has no employee record, so the history names them by email.
        AppUser hrAccount = AppUser.create(null, "hr@rightsku.com", "hash", AppUser.ROLE_HR_ADMIN);
        ReflectionTestUtils.setField(hrAccount, "id", HR);
        when(users.findById(HR)).thenReturn(Optional.of(hrAccount));

        // Comp-Off history in memory (each row 1 minute after the previous one).
        when(adjustments.saveAndFlush(any(LeaveBalanceAdjustment.class))).thenAnswer(call -> {
            LeaveBalanceAdjustment a = call.getArgument(0);
            ReflectionTestUtils.setField(a, "id", 900L + savedAdjustments.size());
            ReflectionTestUtils.setField(a, "createdAt", CLOCK.instant().plusSeconds(60L * savedAdjustments.size()));
            savedAdjustments.add(a);
            return a;
        });
        when(adjustments.findByRequestKey(anyString())).thenAnswer(call -> savedAdjustments.stream()
                .filter(a -> call.getArgument(0).equals(a.getRequestKey())).findFirst());
        when(adjustments.existsByLeaveRequestId(anyLong())).thenAnswer(call -> savedAdjustments.stream()
                .anyMatch(a -> java.util.Objects.equals(call.getArgument(0), a.getLeaveRequestId())));
        when(adjustments.findTop200ByEmployeeIdAndLeaveTypeOrderByCreatedAtDescIdDesc(anyLong(), anyString()))
                .thenAnswer(call -> savedAdjustments.stream()
                        .filter(a -> a.getEmployeeId().equals(call.getArgument(0)) && a.getLeaveType().equals(call.getArgument(1)))
                        .sorted((x, y) -> y.getCreatedAt().compareTo(x.getCreatedAt())).toList());

        ravi = employee(10L, 110L, "EMP010");

        // Balances in memory.
        when(balances.findByEmployeeId(anyLong())).thenAnswer(call -> savedBalances.stream()
                .filter(b -> b.getEmployeeId().equals(call.getArgument(0))).toList());
        when(balances.findForUpdateByEmployeeIdAndLeaveType(anyLong(), anyString())).thenAnswer(call -> savedBalances.stream()
                .filter(b -> b.getEmployeeId().equals(call.getArgument(0)) && b.getLeaveType().equals(call.getArgument(1)))
                .findFirst());
        when(balances.saveAndFlush(any(LeaveBalance.class))).thenAnswer(call -> {
            LeaveBalance b = call.getArgument(0);
            if (!savedBalances.contains(b)) {
                savedBalances.add(b);
            }
            return b;
        });

        // Requests in memory.
        when(requests.saveAndFlush(any(LeaveRequest.class))).thenAnswer(call -> {
            LeaveRequest r = call.getArgument(0);
            if (!savedRequests.contains(r)) {
                ReflectionTestUtils.setField(r, "id", 500L + savedRequests.size());
                savedRequests.add(r);
            }
            return r;
        });
        when(requests.findById(anyLong())).thenAnswer(call -> byId(call.getArgument(0)));
        when(requests.findForUpdate(anyLong())).thenAnswer(call -> byId(call.getArgument(0)));
        when(requests.pendingDays(anyLong(), anyString())).thenAnswer(call -> savedRequests.stream()
                .filter(r -> r.getEmployeeId().equals(call.getArgument(0)) && r.getLeaveType().equals(call.getArgument(1))
                        && r.getStatus().equals("PENDING"))
                .map(LeaveRequest::getDays).reduce(BigDecimal.ZERO, BigDecimal::add));
        when(requests.touching(anyLong(), any(), any())).thenAnswer(call -> {
            LocalDate from = call.getArgument(1);
            LocalDate to = call.getArgument(2);
            return savedRequests.stream().filter(r -> r.getEmployeeId().equals(call.getArgument(0))
                    && !r.getStartDate().isAfter(to) && !r.getEndDate().isBefore(from)).toList();
        });
        when(requests.findByEmployeeIdOrderByStartDateDesc(anyLong())).thenAnswer(call -> savedRequests.stream()
                .filter(r -> r.getEmployeeId().equals(call.getArgument(0))).toList());
        when(requests.findByStatusOrderByCreatedAtAsc(anyString())).thenAnswer(call -> savedRequests.stream()
                .filter(r -> r.getStatus().equals(call.getArgument(0))).toList());
    }

    private Optional<LeaveRequest> byId(long id) {
        return savedRequests.stream().filter(r -> r.getId() == id).findFirst();
    }

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    private Employee employee(long id, long userId, String code) {
        AppUser account = AppUser.create(code, code.toLowerCase() + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", userId);
        Employee e = Employee.create(account, code, new Employee.EmployeeDetails("Ravi", "Kumar", null, null, null, null));
        ReflectionTestUtils.setField(e, "id", id);
        people.add(e);
        when(employees.findByUser_Id(userId)).thenReturn(Optional.of(e));
        when(employees.findById(id)).thenReturn(Optional.of(e));
        when(employees.lockById(id)).thenReturn(Optional.of(e));
        when(employees.findAllById(any())).thenAnswer(call -> {
            Collection<Long> ids = call.getArgument(0);
            return people.stream().filter(p -> ids.contains(p.getId())).toList();
        });
        return e;
    }

    private static LeaveApplyRequest leave(String type, String from, String to) {
        return new LeaveApplyRequest(type, d(from), d(to), " Family function ");
    }

    private LeaveBalanceResponse balance(String type) {
        return service.myBalances(110L).stream().filter(b -> b.leaveType().equals(type)).findFirst().orElseThrow();
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    /* ---------- HR sets balances ---------- */

    @Test
    void everyLeaveTypeStartsAtZeroUntilHrSetsIt() {
        List<LeaveBalanceResponse> list = service.balancesOf(10L);
        assertThat(list).extracting(LeaveBalanceResponse::leaveType).containsExactly("CASUAL", "SICK", "EARNED", "COMP_OFF");
        assertThat(list).allSatisfy(b -> assertThat(b.availableDays()).isEqualByComparingTo("0"));
    }

    @Test
    void hrSetsABalanceAndTheChangeIsAudited() {
        service.setBalance(10L, "casual", new BigDecimal("8"), HR);
        List<LeaveBalanceResponse> list = service.setBalance(10L, "CASUAL", new BigDecimal("7.5"), HR);

        assertThat(list.get(0).balanceDays()).isEqualByComparingTo("7.5");
        assertThat(balance("CASUAL").availableDays()).as("the employee sees it straight away").isEqualByComparingTo("7.5");
        ArgumentCaptor<AuditEntry> logged = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit, org.mockito.Mockito.times(2)).save(logged.capture());
        AuditEntry last = logged.getAllValues().get(1);
        assertThat(last.getActorUserId()).isEqualTo(HR);
        assertThat(last.getAction()).isEqualTo("LEAVE_BALANCE_CHANGED");
        assertThat(last.getEntityId()).isEqualTo("EMP010");
        assertThat(last.getDetails()).isEqualTo("{\"leaveType\":\"CASUAL\",\"previousDays\":8.0,\"newDays\":7.5}");
    }

    @Test
    void negativeTooLargeOrNonHalfDayBalancesAreRefused() {
        for (String bad : new String[] {"-1", "-0.5", "365.5", "1000", "2.25", "0.1"}) {
            Throwable thrown = catchThrowable(() -> service.setBalance(10L, "SICK", new BigDecimal(bad), HR));
            assertApiError(thrown, HttpStatus.BAD_REQUEST, "balanceDays");
        }
        assertApiError(catchThrowable(() -> service.setBalance(10L, "BONUS", BigDecimal.ONE, HR)), HttpStatus.BAD_REQUEST, "leaveType");
        assertThat(savedBalances).isEmpty();
        verify(audit, never()).save(any());
        // 0 and 365 are allowed.
        service.setBalance(10L, "SICK", BigDecimal.ZERO, HR);
        service.setBalance(10L, "SICK", new BigDecimal("365"), HR);
    }

    /* ---------- Employee applies ---------- */

    @Test
    void workingDaysOnlyAreCountedAndHeldBackWhilePending() {
        service.setBalance(10L, "CASUAL", new BigDecimal("5"), HR);

        // Mon 19 to Sun 25 Oct: Sat and Sun are weekly offs, Fri 23 is a holiday -> 4 working days.
        LeaveRequestResponse sent = service.apply(110L, leave("CASUAL", "2026-10-19", "2026-10-25"));

        assertThat(sent.days()).isEqualByComparingTo("4");
        assertThat(sent.status()).isEqualTo("PENDING");
        assertThat(sent.reason()).isEqualTo("Family function");
        assertThat(sent.employeeId()).as("always the signed-in employee").isEqualTo(10L);
        LeaveBalanceResponse casual = balance("CASUAL");
        assertThat(casual.balanceDays()).as("nothing taken off yet").isEqualByComparingTo("5");
        assertThat(casual.pendingDays()).isEqualByComparingTo("4");
        assertThat(casual.availableDays()).isEqualByComparingTo("1");
    }

    @Test
    void notEnoughBalanceIsRefusedWithAClearMessage() {
        service.setBalance(10L, "SICK", new BigDecimal("2"), HR);

        Throwable thrown = catchThrowable(() -> service.apply(110L, leave("SICK", "2026-10-19", "2026-10-21")));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "leaveType");
        assertThat(thrown).hasMessage("Not enough Sick leave: this request needs 3 days, and you have 2 available.");
        assertThat(savedRequests).isEmpty();
    }

    @Test
    void pendingDaysCannotBeUsedTwice() {
        service.setBalance(10L, "CASUAL", new BigDecimal("3"), HR);
        service.apply(110L, leave("CASUAL", "2026-10-19", "2026-10-20"));   // 2 days, pending

        Throwable second = catchThrowable(() -> service.apply(110L, leave("CASUAL", "2026-10-26", "2026-10-27")));
        assertApiError(second, HttpStatus.BAD_REQUEST, "leaveType");
        assertThat(second).hasMessageContaining("you have 1 available");
        assertThat(savedRequests).hasSize(1);
    }

    @Test
    void theSameDatesCannotBeRequestedTwice() {
        service.setBalance(10L, "CASUAL", new BigDecimal("10"), HR);
        service.apply(110L, leave("CASUAL", "2026-10-19", "2026-10-20"));

        Throwable duplicate = catchThrowable(() -> service.apply(110L, leave("CASUAL", "2026-10-19", "2026-10-20")));
        assertApiError(duplicate, HttpStatus.CONFLICT, "startDate");
        Throwable overlap = catchThrowable(() -> service.apply(110L, leave("CASUAL", "2026-10-20", "2026-10-22")));
        assertApiError(overlap, HttpStatus.CONFLICT, "startDate");
        assertThat(savedRequests).hasSize(1);
    }

    @Test
    void datesAreChecked() {
        service.setBalance(10L, "CASUAL", new BigDecimal("10"), HR);
        assertApiError(catchThrowable(() -> service.apply(110L, leave("CASUAL", "2026-10-20", "2026-10-19"))), HttpStatus.BAD_REQUEST, "endDate");
        Throwable weekend = catchThrowable(() -> service.apply(110L, leave("CASUAL", "2026-10-24", "2026-10-25")));
        assertApiError(weekend, HttpStatus.BAD_REQUEST, "endDate");
        assertThat(weekend).hasMessageContaining("weekly offs or company holidays");
        assertApiError(catchThrowable(() -> service.apply(110L, leave("CASUAL", "2026-08-01", "2026-08-03"))), HttpStatus.BAD_REQUEST, "startDate");
        assertApiError(catchThrowable(() -> service.apply(110L, leave("CASUAL", "2026-10-19", "2027-02-01"))), HttpStatus.BAD_REQUEST, "endDate");
        assertApiError(catchThrowable(() -> service.apply(110L, new LeaveApplyRequest("CASUAL", d("2026-10-19"), d("2026-10-19"), "  "))),
                HttpStatus.BAD_REQUEST, "reason");
        assertThat(savedRequests).isEmpty();
    }

    /* ---------- HR decides ---------- */

    @Test
    void approvingTakesTheDaysOffOnceAndIsAudited() {
        service.setBalance(10L, "CASUAL", new BigDecimal("5"), HR);
        LeaveRequestResponse sent = service.apply(110L, leave("CASUAL", "2026-10-19", "2026-10-20"));

        assertThat(service.requestsWithStatus("PENDING")).extracting(LeaveRequestResponse::id).containsExactly(sent.id());
        LeaveRequestResponse approved = service.approve(sent.id(), " Enjoy ", HR);

        assertThat(approved.status()).isEqualTo("APPROVED");
        assertThat(approved.reviewNote()).isEqualTo("Enjoy");
        LeaveBalanceResponse casual = balance("CASUAL");
        assertThat(casual.balanceDays()).isEqualByComparingTo("3");
        assertThat(casual.pendingDays()).isEqualByComparingTo("0");
        assertThat(casual.availableDays()).isEqualByComparingTo("3");
        assertThat(service.myRequests(110L).get(0).status()).as("the employee sees it").isEqualTo("APPROVED");
        assertThat(service.requestsWithStatus("PENDING")).isEmpty();

        // Approving again (double tap, second HR admin) changes nothing.
        Throwable again = catchThrowable(() -> service.approve(sent.id(), null, HR));
        assertApiError(again, HttpStatus.CONFLICT, null);
        assertThat(balance("CASUAL").balanceDays()).isEqualByComparingTo("3");
    }

    @Test
    void rejectingTakesNothingOffAndReleasesTheHeldDays() {
        service.setBalance(10L, "EARNED", new BigDecimal("5"), HR);
        LeaveRequestResponse sent = service.apply(110L, leave("EARNED", "2026-10-19", "2026-10-21"));
        assertThat(balance("EARNED").availableDays()).isEqualByComparingTo("2");

        LeaveRequestResponse rejected = service.reject(sent.id(), "Release week", HR);

        assertThat(rejected.status()).isEqualTo("REJECTED");
        assertThat(rejected.reviewNote()).isEqualTo("Release week");
        LeaveBalanceResponse earned = balance("EARNED");
        assertThat(earned.balanceDays()).isEqualByComparingTo("5");
        assertThat(earned.availableDays()).isEqualByComparingTo("5");
        assertApiError(catchThrowable(() -> service.approve(sent.id(), null, HR)), HttpStatus.CONFLICT, null);
        // The same dates can be requested again after a rejection.
        assertThat(service.apply(110L, leave("EARNED", "2026-10-19", "2026-10-21")).status()).isEqualTo("PENDING");
    }

    @Test
    void approvalIsRefusedIfHrLoweredTheBalanceMeanwhile() {
        service.setBalance(10L, "CASUAL", new BigDecimal("5"), HR);
        LeaveRequestResponse sent = service.apply(110L, leave("CASUAL", "2026-10-19", "2026-10-21"));
        service.setBalance(10L, "CASUAL", new BigDecimal("1"), HR);

        Throwable thrown = catchThrowable(() -> service.approve(sent.id(), null, HR));

        assertApiError(thrown, HttpStatus.CONFLICT, null);
        assertThat(thrown).hasMessageContaining("Update the balance or reject the request");
        assertThat(balance("CASUAL").balanceDays()).as("never negative").isEqualByComparingTo("1");
        assertThat(service.myRequests(110L).get(0).status()).isEqualTo("PENDING");
    }

    @Test
    void approvedLeaveFeedsTheTimesheetTarget() {
        service.setBalance(10L, "CASUAL", new BigDecimal("5"), HR);
        LeaveRequestResponse sent = service.apply(110L, leave("CASUAL", "2026-10-20", "2026-10-20"));
        LeaveRequestLeaveDays leaveDays = new LeaveRequestLeaveDays(requests);
        assertThat(leaveDays.leaveBetween(10L, d("2026-10-19"), d("2026-10-25")))
                .singleElement().satisfies(day -> assertThat(day.status()).isEqualTo(LeaveDays.Status.PENDING));

        service.approve(sent.id(), null, HR);

        assertThat(leaveDays.leaveBetween(10L, d("2026-10-19"), d("2026-10-25")))
                .singleElement().satisfies(day -> {
                    assertThat(day.date()).isEqualTo(d("2026-10-20"));
                    assertThat(day.portion()).isEqualTo(LeaveDays.Portion.FULL_DAY);
                    assertThat(day.status()).isEqualTo(LeaveDays.Status.APPROVED);
                });
    }

    /* ---------- Comp-Off ---------- */

    private static CompOffAdjustmentRequest change(String days, String reason, String key) {
        return new CompOffAdjustmentRequest(days == null ? null : new BigDecimal(days), reason, key);
    }

    private BigDecimal compOffBalance() {
        return compOff.summary(10L).balanceDays();
    }

    @Test
    void compOffBalanceCannotBeSetDirectlyOnlyAdjustedWithAReason() {
        assertApiError(catchThrowable(() -> service.setBalance(10L, "COMP_OFF", new BigDecimal("3"), HR)),
                HttpStatus.BAD_REQUEST, "leaveType");
        assertThat(compOffBalance()).isEqualByComparingTo("0");
        assertThat(savedAdjustments).isEmpty();
    }

    @Test
    void hrAddsCompOffWithAReasonAndTheHistoryShowsWhoAndWhen() {
        CompOffResponse after = compOff.adjust(10L, change("1.5", "  Worked on Sunday 18 Oct  ", "key-add-0001"), HR);

        assertThat(after.balanceDays()).isEqualByComparingTo("1.5");
        assertThat(after.availableDays()).isEqualByComparingTo("1.5");
        assertThat(after.history()).hasSize(1);
        CompOffAdjustmentResponse row = after.history().get(0);
        assertThat(row.source()).isEqualTo("MANUAL");
        assertThat(row.changeDays()).isEqualByComparingTo("1.5");
        assertThat(row.balanceBefore()).isEqualByComparingTo("0");
        assertThat(row.balanceAfter()).isEqualByComparingTo("1.5");
        assertThat(row.reason()).isEqualTo("Worked on Sunday 18 Oct");
        assertThat(row.changedBy()).isEqualTo("hr@rightsku.com");
        assertThat(row.changedAt()).isEqualTo(CLOCK.instant());
        // The employee sees the new balance with the other leave types.
        assertThat(balance("COMP_OFF").availableDays()).isEqualByComparingTo("1.5");
        assertThat(balance("COMP_OFF").label()).isEqualTo("Comp-Off");

        ArgumentCaptor<AuditEntry> logged = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(logged.capture());
        assertThat(logged.getValue().getAction()).isEqualTo("COMP_OFF_ADJUSTED");
        assertThat(logged.getValue().getDetails()).isEqualTo("{\"changeDays\":1.5,\"previousDays\":0.0,\"newDays\":1.5}");
    }

    @Test
    void hrDeductsCompOffAndTheNewestChangeIsListedFirst() {
        compOff.adjust(10L, change("2", "Worked two Saturdays", "key-add-0002"), HR);
        CompOffResponse after = compOff.adjust(10L, change("-0.5", "Half day entered twice by mistake", "key-cut-0002"), HR);

        assertThat(after.balanceDays()).isEqualByComparingTo("1.5");
        assertThat(after.history()).extracting(CompOffAdjustmentResponse::reason)
                .containsExactly("Half day entered twice by mistake", "Worked two Saturdays");
        assertThat(after.history().get(0).balanceBefore()).isEqualByComparingTo("2");
        assertThat(after.history().get(0).balanceAfter()).isEqualByComparingTo("1.5");
    }

    @Test
    void invalidAdjustmentsAreRefusedAndChangeNothing() {
        compOff.adjust(10L, change("2", "Worked two Saturdays", "key-add-0003"), HR);

        assertApiError(catchThrowable(() -> compOff.adjust(10L, change(null, "Reason", "key-bad-0001"), HR)), HttpStatus.BAD_REQUEST, "changeDays");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("0", "Reason", "key-bad-0002"), HR)), HttpStatus.BAD_REQUEST, "changeDays");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("0.3", "Reason", "key-bad-0003"), HR)), HttpStatus.BAD_REQUEST, "changeDays");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("400", "Reason", "key-bad-0004"), HR)), HttpStatus.BAD_REQUEST, "changeDays");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("364", "Too many", "key-bad-0005"), HR)), HttpStatus.BAD_REQUEST, "changeDays");
        Throwable tooMuch = catchThrowable(() -> compOff.adjust(10L, change("-3", "Reason", "key-bad-0006"), HR));
        assertApiError(tooMuch, HttpStatus.BAD_REQUEST, "changeDays");
        assertThat(tooMuch).hasMessageContaining("You can deduct at most 2 days");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("1", "   ", "key-bad-0007"), HR)), HttpStatus.BAD_REQUEST, "reason");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("1", "ok", "key-bad-0008"), HR)), HttpStatus.BAD_REQUEST, "reason");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("1", "x".repeat(501), "key-bad-0009"), HR)), HttpStatus.BAD_REQUEST, "reason");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("1", "Reason", null), HR)), HttpStatus.BAD_REQUEST, "requestKey");
        assertApiError(catchThrowable(() -> compOff.adjust(10L, change("1", "Reason", "bad key!"), HR)), HttpStatus.BAD_REQUEST, "requestKey");
        assertApiError(catchThrowable(() -> compOff.adjust(99L, change("1", "Reason", "key-bad-0010"), HR)), HttpStatus.NOT_FOUND, null);

        assertThat(compOffBalance()).isEqualByComparingTo("2");
        assertThat(savedAdjustments).hasSize(1);
    }

    @Test
    void theSameChangeSentTwiceIsAppliedOnce() {
        compOff.adjust(10L, change("1", "Worked on Diwali", "key-same-0001"), HR);
        CompOffResponse again = compOff.adjust(10L, change("1", "Worked on Diwali", "key-same-0001"), HR);

        assertThat(again.balanceDays()).isEqualByComparingTo("1");
        assertThat(again.history()).hasSize(1);
        verify(audit).save(any(AuditEntry.class));

        // The same key can never be used for another employee.
        employee(11L, 111L, "EMP011");
        assertApiError(catchThrowable(() -> compOff.adjust(11L, change("1", "Worked on Diwali", "key-same-0001"), HR)),
                HttpStatus.CONFLICT, "requestKey");
        assertThat(compOff.summary(11L).balanceDays()).isEqualByComparingTo("0");
    }

    @Test
    void aPendingCompOffRequestTakesNothingOffTheBalance() {
        compOff.adjust(10L, change("2", "Worked two Saturdays", "key-add-0004"), HR);

        LeaveRequestResponse sent = service.apply(110L, new LeaveApplyRequest("comp_off", d("2026-10-19"), d("2026-10-19"), " Day off for Saturday work "));

        assertThat(sent.status()).isEqualTo("PENDING");
        assertThat(sent.leaveType()).isEqualTo("COMP_OFF");
        assertThat(sent.label()).isEqualTo("Comp-Off");
        assertThat(sent.days()).isEqualByComparingTo("1");
        CompOffResponse summary = compOff.summary(10L);
        assertThat(summary.balanceDays()).as("not deducted while pending").isEqualByComparingTo("2");
        assertThat(summary.pendingDays()).isEqualByComparingTo("1");
        assertThat(summary.availableDays()).isEqualByComparingTo("1");
        assertThat(summary.history()).hasSize(1);
        assertThat(service.requestsWithStatus("PENDING")).extracting(LeaveRequestResponse::label).containsExactly("Comp-Off");
        assertThat(service.myRequests(110L)).extracting(LeaveRequestResponse::status).containsExactly("PENDING");
    }

    @Test
    void approvingCompOffTakesTheDaysOffOnceAndRecordsIt() {
        compOff.adjust(10L, change("2", "Worked two Saturdays", "key-add-0005"), HR);
        LeaveRequestResponse sent = service.apply(110L, leave("COMP_OFF", "2026-10-19", "2026-10-19"));

        LeaveRequestResponse approved = service.approve(sent.id(), null, HR);

        assertThat(approved.status()).isEqualTo("APPROVED");
        CompOffResponse summary = compOff.summary(10L);
        assertThat(summary.balanceDays()).isEqualByComparingTo("1");
        assertThat(summary.pendingDays()).isEqualByComparingTo("0");
        CompOffAdjustmentResponse newest = summary.history().get(0);
        assertThat(newest.source()).isEqualTo("LEAVE_APPROVED");
        assertThat(newest.changeDays()).isEqualByComparingTo("-1");
        assertThat(newest.balanceBefore()).isEqualByComparingTo("2");
        assertThat(newest.balanceAfter()).isEqualByComparingTo("1");
        assertThat(newest.leaveRequestId()).isEqualTo(sent.id());
        assertThat(newest.reason()).isEqualTo("Leave approved: Mon 19 Oct 2026");
        assertThat(service.myRequests(110L).get(0).status()).as("the employee sees it").isEqualTo("APPROVED");

        // Approving again (double tap, second HR admin) takes nothing more off.
        assertApiError(catchThrowable(() -> service.approve(sent.id(), null, HR)), HttpStatus.CONFLICT, null);
        assertThat(compOffBalance()).isEqualByComparingTo("1");
        assertThat(compOff.summary(10L).history()).hasSize(2);
    }

    @Test
    void rejectingCompOffTakesNothingOff() {
        compOff.adjust(10L, change("1", "Worked on Sunday", "key-add-0006"), HR);
        LeaveRequestResponse sent = service.apply(110L, leave("COMP_OFF", "2026-10-20", "2026-10-20"));

        assertThat(service.reject(sent.id(), "Busy week", HR).status()).isEqualTo("REJECTED");

        CompOffResponse summary = compOff.summary(10L);
        assertThat(summary.balanceDays()).isEqualByComparingTo("1");
        assertThat(summary.availableDays()).isEqualByComparingTo("1");
        assertThat(summary.history()).hasSize(1);
        assertThat(service.myRequests(110L).get(0).reviewNote()).isEqualTo("Busy week");
    }

    @Test
    void compOffNeedsEnoughBalanceAndOtherTypesAreUnaffected() {
        Throwable none = catchThrowable(() -> service.apply(110L, leave("COMP_OFF", "2026-10-19", "2026-10-19")));
        assertApiError(none, HttpStatus.BAD_REQUEST, "leaveType");
        assertThat(none).hasMessageContaining("Not enough Comp-Off leave");

        compOff.adjust(10L, change("3", "Worked three Sundays", "key-add-0007"), HR);
        service.setBalance(10L, "CASUAL", new BigDecimal("5"), HR);
        assertThat(balance("CASUAL").balanceDays()).isEqualByComparingTo("5");
        assertThat(balance("COMP_OFF").balanceDays()).isEqualByComparingTo("3");
        assertThat(balance("SICK").balanceDays()).isEqualByComparingTo("0");
    }
}
