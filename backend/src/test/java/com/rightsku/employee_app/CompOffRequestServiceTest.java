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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Comp-Off requests and HR approval. Repositories are mocked: no database.
 * "Today" is Wednesday 14 Oct 2026. Company default: Saturday and Sunday off.
 * Company holiday: Friday 2 Oct 2026 (Gandhi Jayanti).
 */
class CompOffRequestServiceTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock CLOCK = Clock.fixed(
            LocalDate.parse("2026-10-14").atTime(10, 0).atZone(INDIA).toInstant(), INDIA);
    private static final Long HR = 1L;

    private CompOffRequestRepository requests;
    private LeaveBalanceRepository balances;
    private LeaveBalanceAdjustmentRepository adjustments;
    private EmployeeRepository employees;
    private WorkScheduleRepository schedules;
    private NotificationRepository notificationRows;
    private AuditEntryRepository audit;
    private CompOffRequestService service;
    private Employee ravi;
    private LeaveBalance compOffBalance;
    private final List<CompOffRequest> saved = new ArrayList<>();

    @BeforeEach
    void setUp() {
        requests = mock(CompOffRequestRepository.class);
        balances = mock(LeaveBalanceRepository.class);
        adjustments = mock(LeaveBalanceAdjustmentRepository.class);
        employees = mock(EmployeeRepository.class);
        schedules = mock(WorkScheduleRepository.class);
        notificationRows = mock(NotificationRepository.class);
        audit = mock(AuditEntryRepository.class);
        CompanyHolidayRepository holidays = mock(CompanyHolidayRepository.class);
        when(holidays.findByHolidayDateBetweenOrderByHolidayDateAsc(any(), any())).thenAnswer(call -> {
            LocalDate holiday = LocalDate.parse("2026-10-02");
            LocalDate from = call.getArgument(0);
            LocalDate to = call.getArgument(1);
            return holiday.isBefore(from) || holiday.isAfter(to)
                    ? List.of() : List.of(CompanyHoliday.create(holiday, "Gandhi Jayanti", HR));
        });
        WorkCalendarService calendars = new WorkCalendarService(schedules, holidays, "SATURDAY,SUNDAY", new BigDecimal("9"));
        service = new CompOffRequestService(requests, balances, adjustments, employees, calendars,
                new NotificationService(notificationRows, CLOCK), audit, CLOCK);

        AppUser account = AppUser.create("EMP010", "ravi@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", 110L);
        ravi = Employee.create(account, "EMP010", new Employee.EmployeeDetails("Ravi", "Kumar", null, null, null, null));
        ReflectionTestUtils.setField(ravi, "id", 10L);
        ReflectionTestUtils.setField(ravi, "joiningDate", LocalDate.parse("2026-09-21"));
        when(employees.findByUser_Id(110L)).thenReturn(Optional.of(ravi));
        when(employees.findById(10L)).thenReturn(Optional.of(ravi));
        when(employees.lockById(10L)).thenReturn(Optional.of(ravi));

        // A tiny in-memory stand-in for the requests table.
        when(requests.saveAndFlush(any(CompOffRequest.class))).thenAnswer(call -> {
            CompOffRequest r = call.getArgument(0);
            if (!saved.contains(r)) {
                ReflectionTestUtils.setField(r, "id", 100L + saved.size());
                saved.add(r);
            }
            return r;
        });
        when(requests.findById(any())).thenAnswer(call ->
                saved.stream().filter(r -> r.getId().equals(call.getArgument(0))).findFirst());
        when(requests.findForUpdate(any())).thenAnswer(call ->
                saved.stream().filter(r -> r.getId().equals(call.getArgument(0))).findFirst());
        when(requests.activeOn(eq(10L), any())).thenAnswer(call -> saved.stream()
                .filter(r -> r.getWorkDate().equals(call.getArgument(1)) && !r.getStatus().equals("REJECTED")).toList());

        compOffBalance = LeaveBalance.start(10L, LeaveType.COMP_OFF);
        compOffBalance.set(new BigDecimal("1.0"), HR);
        when(balances.findForUpdateByEmployeeIdAndLeaveType(10L, "COMP_OFF")).thenReturn(Optional.of(compOffBalance));
    }

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    private CompOffRequestResponse ask(String day, String days) {
        return service.apply(110L, new CompOffApplyRequest(d(day), new BigDecimal(days), "Release support"));
    }

    private Throwable refused(String day, String days) {
        return catchThrowable(() -> ask(day, days));
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

    /* ---------- Asking ---------- */

    @Test
    void employeeAsksForAFullDayAfterWorkingOnTheirWeeklyOff() {
        CompOffRequestResponse r = ask("2026-10-11", "1"); // Sunday

        assertThat(r.status()).isEqualTo("PENDING");
        assertThat(r.days()).isEqualByComparingTo("1.0");
        assertThat(r.dayKind()).isEqualTo("WEEKLY_OFF");
        assertThat(r.employeeId()).isEqualTo(10L);
        assertThat(saved).hasSize(1);
        verify(employees).lockById(10L);
        // Asking credits nothing.
        verify(adjustments, never()).saveAndFlush(any());
        verify(balances, never()).saveAndFlush(any());
    }

    @Test
    void halfDaysAndCompanyHolidaysAreAllowed() {
        CompOffRequestResponse r = ask("2026-10-02", "0.5"); // Friday holiday

        assertThat(r.days()).isEqualByComparingTo("0.5");
        assertThat(r.dayKind()).isEqualTo("HOLIDAY");
        assertThat(r.holidayName()).isEqualTo("Gandhi Jayanti");
    }

    @Test
    void theEmployeesOwnScheduleDecidesWhatAWeeklyOffIs() {
        // Tuesday and Wednesday off from Monday 5 Oct.
        WorkSchedule tueWed = WorkSchedule.create(10L, d("2026-10-05"),
                EnumSet.of(DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY), new BigDecimal("9"), HR);
        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(10L)).thenReturn(List.of(tueWed));

        assertThat(ask("2026-10-06", "1").dayKind()).isEqualTo("WEEKLY_OFF"); // Tuesday: their weekly off
        Throwable sunday = refused("2026-10-11", "1"); // Sunday: a working day for them
        assertApiError(sunday, HttpStatus.BAD_REQUEST, "workDate");
        assertThat(sunday).hasMessageContaining("was a working day for you");
    }

    @Test
    void workingDaysTodayFutureTooOldAndBeforeJoiningAreRefused() {
        assertApiError(refused("2026-10-12", "1"), HttpStatus.BAD_REQUEST, "workDate"); // Monday, working
        assertApiError(refused("2026-10-14", "1"), HttpStatus.BAD_REQUEST, "workDate"); // today
        assertApiError(refused("2026-10-18", "1"), HttpStatus.BAD_REQUEST, "workDate"); // next Sunday
        // The 30-day limit: Monday and Sunday off, so both boundary days are weekly offs.
        ReflectionTestUtils.setField(ravi, "joiningDate", null);
        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(10L)).thenReturn(List.of(WorkSchedule.create(10L,
                d("2026-08-31"), EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.SUNDAY), new BigDecimal("9"), HR)));
        Throwable tooOld = refused("2026-09-13", "1");                                   // Sunday, 31 days ago
        assertApiError(tooOld, HttpStatus.BAD_REQUEST, "workDate");
        assertThat(tooOld).hasMessageContaining("at most 30 days later");
        assertThat(ask("2026-09-14", "1").status()).isEqualTo("PENDING");               // Monday, exactly 30 days ago
        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(10L)).thenReturn(List.of());
        ReflectionTestUtils.setField(ravi, "joiningDate", d("2026-09-21"));
        Throwable beforeJoining = refused("2026-09-20", "1"); // a Sunday before joining on 21 Sep
        assertApiError(beforeJoining, HttpStatus.BAD_REQUEST, "workDate");
        assertThat(beforeJoining).hasMessageContaining("before your joining date");
    }

    @Test
    void onlyFullOrHalfDaysAndAReasonAreAccepted() {
        for (String days : new String[] {"0", "0.25", "0.75", "1.5", "2"}) {
            assertApiError(refused("2026-10-11", days), HttpStatus.BAD_REQUEST, "days");
        }
        assertApiError(catchThrowable(() -> service.apply(110L,
                new CompOffApplyRequest(d("2026-10-11"), BigDecimal.ONE, " a "))), HttpStatus.BAD_REQUEST, "reason");
        assertThat(saved).isEmpty();
    }

    @Test
    void theSameDayCannotBeAskedForTwiceUnlessRejected() {
        ask("2026-10-11", "1");
        Throwable again = refused("2026-10-11", "0.5");
        assertApiError(again, HttpStatus.CONFLICT, "workDate");
        assertThat(again).hasMessageContaining("already have a pending Comp-Off request");

        service.reject(100L, "Not approved in advance", HR);
        assertThat(ask("2026-10-11", "0.5").status()).isEqualTo("PENDING");
        assertThat(saved).hasSize(2);
    }

    @Test
    void aDoubleTapThatReachesTheDatabaseTwiceGivesAClearMessage() {
        when(requests.saveAndFlush(any(CompOffRequest.class)))
                .thenThrow(new DataIntegrityViolationException("ux_comp_off_requests_active_day"));

        assertApiError(refused("2026-10-11", "1"), HttpStatus.CONFLICT, "workDate");
    }

    /* ---------- HR decisions ---------- */

    @Test
    void approvingCreditsTheBalanceOnceWithHistoryAuditAndNotification() {
        ask("2026-10-11", "1");

        CompOffRequestResponse r = service.approve(100L, "Thanks for the weekend support", HR);

        assertThat(r.status()).isEqualTo("APPROVED");
        assertThat(compOffBalance.getBalanceDays()).isEqualByComparingTo("2.0");
        ArgumentCaptor<LeaveBalanceAdjustment> history = ArgumentCaptor.forClass(LeaveBalanceAdjustment.class);
        verify(adjustments).saveAndFlush(history.capture());
        LeaveBalanceAdjustment credit = history.getValue();
        assertThat(credit.getSource()).isEqualTo(LeaveBalanceAdjustment.SOURCE_COMP_OFF_EARNED);
        assertThat(credit.getCompOffRequestId()).isEqualTo(100L);
        assertThat(credit.getChangeDays()).isEqualByComparingTo("1.0");
        assertThat(credit.getBalanceBefore()).isEqualByComparingTo("1.0");
        assertThat(credit.getBalanceAfter()).isEqualByComparingTo("2.0");
        assertThat(credit.getLeaveRequestId()).isNull();
        assertThat(credit.getRequestKey()).isNull();
        assertThat(credit.getReason()).isEqualTo("Comp-Off approved: worked on 11 Oct 2026");

        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("COMP_OFF_CREDITED");
        assertThat(entry.getValue().getDetails()).contains("\"previousDays\":1.0").contains("\"newDays\":2.0");

        List<Notification> sent = sentNotifications();
        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).getUserId()).isEqualTo(110L);
        assertThat(sent.get(0).getType()).isEqualTo(Notification.COMP_OFF_APPROVED);
        assertThat(sent.get(0).getMessage()).isEqualTo("Your Comp-Off request for 11 Oct 2026 was approved: "
                + "1 day added to your Comp-Off balance. HR note: Thanks for the weekend support");
    }

    @Test
    void aSecondApprovalOfTheSameRequestCreditsNothing() {
        ask("2026-10-11", "0.5");
        service.approve(100L, null, HR);

        Throwable again = catchThrowable(() -> service.approve(100L, null, HR));

        assertApiError(again, HttpStatus.CONFLICT, null);
        assertThat(again).hasMessageContaining("already approved");
        assertThat(compOffBalance.getBalanceDays()).isEqualByComparingTo("1.5");
        verify(adjustments, times(1)).saveAndFlush(any());
        verify(balances, times(1)).saveAndFlush(any());
    }

    @Test
    void anExistingCreditForTheRequestIsASecondGuard() {
        ask("2026-10-11", "1");
        when(adjustments.existsByCompOffRequestId(100L)).thenReturn(true);

        assertApiError(catchThrowable(() -> service.approve(100L, null, HR)), HttpStatus.CONFLICT, null);
        assertThat(compOffBalance.getBalanceDays()).isEqualByComparingTo("1.0");
        verify(adjustments, never()).saveAndFlush(any());
    }

    @Test
    void theBalanceNeverGoesAbove365Days() {
        compOffBalance.set(new BigDecimal("364.5"), HR);
        ask("2026-10-11", "1");

        assertApiError(catchThrowable(() -> service.approve(100L, null, HR)), HttpStatus.CONFLICT, null);
        assertThat(compOffBalance.getBalanceDays()).isEqualByComparingTo("364.5");
        assertThat(saved.get(0).getStatus()).isEqualTo("PENDING");
    }

    @Test
    void anEmployeeWithoutABalanceRowStartsFromZero() {
        when(balances.findForUpdateByEmployeeIdAndLeaveType(10L, "COMP_OFF")).thenReturn(Optional.empty());
        ask("2026-10-11", "0.5");

        service.approve(100L, null, HR);

        ArgumentCaptor<LeaveBalance> balance = ArgumentCaptor.forClass(LeaveBalance.class);
        verify(balances).saveAndFlush(balance.capture());
        assertThat(balance.getValue().getBalanceDays()).isEqualByComparingTo("0.5");
    }

    @Test
    void rejectingCreditsNothingAndTellsTheEmployee() {
        ask("2026-10-11", "1");

        CompOffRequestResponse r = service.reject(100L, "Not approved in advance", HR);

        assertThat(r.status()).isEqualTo("REJECTED");
        assertThat(r.reviewNote()).isEqualTo("Not approved in advance");
        assertThat(compOffBalance.getBalanceDays()).isEqualByComparingTo("1.0");
        verify(adjustments, never()).saveAndFlush(any());
        verify(balances, never()).saveAndFlush(any());
        List<Notification> sent = sentNotifications();
        assertThat(sent).extracting(Notification::getType).containsExactly(Notification.COMP_OFF_REJECTED);
        assertThat(sent.get(0).getMessage())
                .isEqualTo("Your Comp-Off request for 11 Oct 2026 was rejected. HR note: Not approved in advance");
        // A decided request cannot be decided again.
        assertApiError(catchThrowable(() -> service.approve(100L, null, HR)), HttpStatus.CONFLICT, null);
    }

    @Test
    void unknownRequestsAndStatusesAnswerClearly() {
        assertApiError(catchThrowable(() -> service.approve(999L, null, HR)), HttpStatus.NOT_FOUND, null);
        assertApiError(catchThrowable(() -> service.withStatus("MAYBE")), HttpStatus.BAD_REQUEST, "status");
    }

    @Test
    void countsComeFromTheDatabase() {
        when(requests.countByStatusGrouped()).thenReturn(List.of(
                new Object[] {"PENDING", 2L}, new Object[] {"APPROVED", 5L}));

        ApprovalSummaryResponse.Counts counts = service.counts();

        assertThat(counts.pending()).isEqualTo(2);
        assertThat(counts.approved()).isEqualTo(5);
        assertThat(counts.rejected()).isZero();
    }
}
