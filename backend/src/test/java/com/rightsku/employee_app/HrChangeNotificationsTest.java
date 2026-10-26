package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Notifications for HR's changes (leave and Comp-Off balances, the holiday
 * calendar, Form 16 and hike letters), the daily reminder about requests
 * waiting 2 days or more, and the compensation (hike) letter's yearly period.
 */
class HrChangeNotificationsTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Instant NOW = Instant.parse("2026-10-26T04:30:00Z"); // 10:00 IST
    private static final Clock CLOCK = Clock.fixed(NOW, INDIA);

    private final NotificationRepository rows = mock(NotificationRepository.class);
    private final List<Notification> saved = new ArrayList<>();
    private final List<PushNotifier.Created> pushed = new ArrayList<>();
    private final NotificationService notifications;

    HrChangeNotificationsTest() {
        when(rows.save(any(Notification.class))).thenAnswer(call -> {
            saved.add(call.getArgument(0));
            return call.getArgument(0);
        });
        notifications = new NotificationService(rows, CLOCK, e -> pushed.add((PushNotifier.Created) e));
    }

    private static Employee employee(long id, long userId, boolean active) {
        AppUser user = AppUser.create("EMP0" + id, "e" + id + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(user, "id", userId);
        Employee e = mock(Employee.class);
        when(e.getId()).thenReturn(id);
        when(e.getUser()).thenReturn(user);
        when(e.isActive()).thenReturn(active);
        when(e.getEmployeeCode()).thenReturn("EMP0" + id);
        return e;
    }

    /* ---------- Balances ---------- */

    @Test
    void aLeaveBalanceChangeTellsTheEmployee() {
        notifications.leaveBalanceUpdated(employee(1L, 101L, true), "Casual", new BigDecimal("6.0"));

        assertThat(pushed).singleElement().satisfies(p -> {
            assertThat(p.userId()).isEqualTo(101L);
            assertThat(p.type()).isEqualTo(Notification.LEAVE_BALANCE_UPDATED);
            assertThat(p.title()).isEqualTo("Leave balance updated");
            assertThat(p.message()).isEqualTo("HR set your Casual leave balance to 6 days.");
        });
    }

    @Test
    void aCompOffChangeSaysWhatChangedAndTheNewBalance() {
        notifications.compOffBalanceUpdated(employee(1L, 101L, true), new BigDecimal("1.0"), new BigDecimal("2.0"), "Worked on Sunday");
        notifications.compOffBalanceUpdated(employee(1L, 101L, true), new BigDecimal("-0.5"), new BigDecimal("1.5"), null);

        assertThat(pushed).extracting(PushNotifier.Created::message).containsExactly(
                "HR added 1 day to your Comp-Off balance. It is now 2 days. HR note: Worked on Sunday",
                "HR deducted 0.5 days from your Comp-Off balance. It is now 1.5 days.");
    }

    /* ---------- Holiday calendar ---------- */

    @Test
    void everyActiveEmployeeHearsAboutAHolidayChange() {
        CompanyHolidayRepository holidays = mock(CompanyHolidayRepository.class);
        EmployeeRepository employees = mock(EmployeeRepository.class);
        List<Employee> everyone = List.of(employee(1L, 101L, true), employee(2L, 102L, true), employee(3L, 103L, false));
        when(employees.findAll()).thenReturn(everyone);
        when(holidays.findByHolidayDate(any())).thenReturn(Optional.empty());
        HolidayService service = new HolidayService(holidays, mock(AuditEntryRepository.class), employees, notifications);

        service.create(new HolidayRequest(LocalDate.parse("2026-11-09"), "Diwali"), 1L);

        assertThat(pushed).extracting(PushNotifier.Created::userId).containsExactly(101L, 102L);
        assertThat(pushed).allSatisfy(p -> {
            assertThat(p.type()).isEqualTo(Notification.HOLIDAYS_UPDATED);
            assertThat(p.message()).isEqualTo("Diwali was added on Mon 9 Nov 2026.");
        });
    }

    /* ---------- Documents ---------- */

    @Test
    void form16AndHikeLettersHaveTheirOwnTitles() {
        Employee priya = employee(2L, 102L, true);
        EmployeeDocument form16 = mock(EmployeeDocument.class);
        when(form16.getType()).thenReturn(DocumentType.FORM_16);
        when(form16.getEmployee()).thenReturn(priya);
        when(form16.getTitle()).thenReturn("Form 16 - FY 2025-26");
        EmployeeDocument hike = mock(EmployeeDocument.class);
        when(hike.getType()).thenReturn(DocumentType.COMPENSATION_LETTER);
        when(hike.getEmployee()).thenReturn(priya);
        when(hike.getTitle()).thenReturn("Compensation letter - 2026");

        notifications.documentPublished(form16, false);
        notifications.documentPublished(hike, false);

        assertThat(pushed).extracting(PushNotifier.Created::title).containsExactly("Form 16 published", "Compensation letter published");
    }

    @Test
    void aHikeLetterBelongsToOneCalendarYear() {
        assertThat(DocumentType.parse("compensation_letter")).contains(DocumentType.COMPENSATION_LETTER);
        assertThat(DocumentType.COMPENSATION_LETTER.normalizePeriod("2026")).isEqualTo("2026");
        assertThat(DocumentType.COMPENSATION_LETTER.defaultTitle("2026")).isEqualTo("Compensation letter - 2026");
        assertThatThrownBy(() -> DocumentType.COMPENSATION_LETTER.normalizePeriod("2026-01"))
                .hasMessageContaining("year of the hike letter");
        assertThatThrownBy(() -> DocumentType.COMPENSATION_LETTER.normalizePeriod("")).isInstanceOf(IllegalArgumentException.class);
    }

    /* ---------- Requests waiting 2 days or more ---------- */

    private static LeaveRequest leave(long id, long employeeId, Instant created) {
        LeaveRequest r = mock(LeaveRequest.class);
        when(r.getId()).thenReturn(id);
        when(r.getEmployeeId()).thenReturn(employeeId);
        when(r.getLeaveType()).thenReturn("CASUAL");
        when(r.getStartDate()).thenReturn(LocalDate.parse("2026-11-02"));
        when(r.getCreatedAt()).thenReturn(created);
        return r;
    }

    @Test
    void requestsWaitingTwoDaysRemindTheEmployeeAndEveryHrAdminDaily() {
        LeaveRequestRepository leaves = mock(LeaveRequestRepository.class);
        CompOffRequestRepository compOffs = mock(CompOffRequestRepository.class);
        EmployeeRepository employees = mock(EmployeeRepository.class);
        AppUserRepository users = mock(AppUserRepository.class);

        LeaveRequest old = leave(41L, 1L, NOW.minusSeconds(3 * 86_400));
        LeaveRequest fresh = leave(42L, 2L, NOW.minusSeconds(86_400)); // only 1 day: not yet
        when(leaves.findByStatusOrderByCreatedAtAsc("PENDING")).thenReturn(List.of(old, fresh));
        CompOffRequest compOff = mock(CompOffRequest.class);
        when(compOff.getId()).thenReturn(7L);
        when(compOff.getEmployeeId()).thenReturn(2L);
        when(compOff.getWorkDate()).thenReturn(LocalDate.parse("2026-10-18"));
        when(compOff.getCreatedAt()).thenReturn(NOW.minusSeconds(2 * 86_400));
        when(compOffs.findByStatusOrderByCreatedAtAsc("PENDING")).thenReturn(List.of(compOff));
        Employee ravi = employee(1L, 101L, true);
        Employee priya = employee(2L, 102L, true);
        when(employees.findById(1L)).thenReturn(Optional.of(ravi));
        when(employees.findById(2L)).thenReturn(Optional.of(priya));
        AppUser hr = AppUser.create("hr@rightsku.com", "hash", AppUser.ROLE_HR_ADMIN);
        ReflectionTestUtils.setField(hr, "id", 900L);
        when(users.findByRoleAndActiveTrue(AppUser.ROLE_HR_ADMIN)).thenReturn(List.of(hr));

        int[] sent = new PendingRequestReminderJob(leaves, compOffs, employees, users, notifications, CLOCK).remindAt(NOW);

        assertThat(sent).containsExactly(1, 1);
        assertThat(pushed).extracting(PushNotifier.Created::userId, PushNotifier.Created::type).containsExactly(
                org.assertj.core.groups.Tuple.tuple(101L, Notification.LEAVE_PENDING_REMINDER),
                org.assertj.core.groups.Tuple.tuple(102L, Notification.COMP_OFF_PENDING_REMINDER),
                org.assertj.core.groups.Tuple.tuple(900L, Notification.PENDING_APPROVALS_REMINDER));
        assertThat(pushed.get(0).message()).isEqualTo("Your Casual leave from 2 Nov 2026 is still waiting for HR’s approval.");
        assertThat(pushed.get(2).message()).isEqualTo("1 leave request and 1 Comp-Off request waited 2 days or more. Please approve or reject them.");
    }

    @Test
    void nothingWaitingLongEnoughMeansNoReminders() {
        LeaveRequestRepository leaves = mock(LeaveRequestRepository.class);
        CompOffRequestRepository compOffs = mock(CompOffRequestRepository.class);
        List<LeaveRequest> recent = List.of(leave(42L, 2L, NOW.minusSeconds(3600)));
        when(leaves.findByStatusOrderByCreatedAtAsc("PENDING")).thenReturn(recent);
        when(compOffs.findByStatusOrderByCreatedAtAsc("PENDING")).thenReturn(List.of());

        int[] sent = new PendingRequestReminderJob(leaves, compOffs, mock(EmployeeRepository.class),
                mock(AppUserRepository.class), notifications, CLOCK).remindAt(NOW);

        assertThat(sent).containsExactly(0, 0);
        assertThat(pushed).isEmpty();
    }
}
