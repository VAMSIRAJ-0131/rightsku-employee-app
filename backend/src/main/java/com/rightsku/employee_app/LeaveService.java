package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leave balances and leave requests.
 *
 * <p><b>Policy</b> (there was no leave policy in the app before):
 * <ul>
 *   <li>HR sets each employee's balance per leave type (Casual, Sick, Earned),
 *       0 to 365 days in half days. Negative balances are not allowed.</li>
 *   <li>A request counts working days only: weekly offs (from the employee's
 *       HR schedule) and company holidays are not counted.</li>
 *   <li>While a request is PENDING its days are held back: a new request can
 *       only use balance minus pending days.</li>
 *   <li>The balance goes down only when HR approves, exactly once. Rejecting
 *       releases the held days. Nothing is taken off at submission.</li>
 *   <li>Overlapping requests (pending or approved) are refused.</li>
 *   <li>Comp-Off works the same way for requests, but its balance is never
 *       set directly: HR adds or deducts days with a reason (CompOffService),
 *       and every change, including each approval, is kept in
 *       leave_balance_adjustments.</li>
 * </ul>
 * Every leave action for one employee first locks that employee's row, so
 * two requests (or a request and an approval) never run at the same time and
 * can never use more than the balance.
 */
@Service
public class LeaveService {

    /** A request can start at most this many days in the past (for example sick leave sent afterwards). */
    static final int MAX_DAYS_BACK = 60;
    /** A request can cover at most this many calendar days. */
    static final int MAX_SPAN_DAYS = 93;
    static final BigDecimal MAX_BALANCE = BigDecimal.valueOf(365);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);

    private final LeaveBalanceRepository balances;
    private final LeaveRequestRepository requests;
    private final EmployeeRepository employees;
    private final WorkCalendarService calendarService;
    private final AuditEntryRepository audit;
    private final LeaveBalanceAdjustmentRepository adjustments;
    private final NotificationService notifications;
    private final Clock clock;

    public LeaveService(
            LeaveBalanceRepository balances,
            LeaveRequestRepository requests,
            EmployeeRepository employees,
            WorkCalendarService calendarService,
            AuditEntryRepository audit,
            LeaveBalanceAdjustmentRepository adjustments,
            NotificationService notifications,
            Clock clock) {
        this.balances = balances;
        this.requests = requests;
        this.employees = employees;
        this.calendarService = calendarService;
        this.audit = audit;
        this.adjustments = adjustments;
        this.notifications = notifications;
        this.clock = clock;
    }

    /* ---------- Balances ---------- */

    /** All leave types for one employee (0 where HR has not set a balance yet). */
    @Transactional(readOnly = true)
    public List<LeaveBalanceResponse> balancesOf(long employeeId) {
        employees.findById(employeeId).orElseThrow(() -> ApiException.notFound("Employee not found."));
        return balanceList(employeeId);
    }

    @Transactional(readOnly = true)
    public List<LeaveBalanceResponse> myBalances(long userId) {
        return balanceList(currentEmployee(userId).getId());
    }

    private List<LeaveBalanceResponse> balanceList(long employeeId) {
        Map<String, LeaveBalance> saved = balances.findByEmployeeId(employeeId).stream()
                .collect(Collectors.toMap(LeaveBalance::getLeaveType, b -> b));
        List<LeaveBalanceResponse> result = new ArrayList<>();
        for (LeaveType type : LeaveType.values()) {
            LeaveBalance b = saved.get(type.name());
            BigDecimal balance = b == null ? zero() : b.getBalanceDays().setScale(1, RoundingMode.HALF_UP);
            BigDecimal pending = requests.pendingDays(employeeId, type.name()).setScale(1, RoundingMode.HALF_UP);
            result.add(new LeaveBalanceResponse(type.name(), type.label(), balance, pending,
                    balance.subtract(pending).max(zero()), b == null ? null : b.getUpdatedAt()));
        }
        return result;
    }

    /** HR: sets one leave type's balance. Recorded in the audit log with the previous and new value. */
    @Transactional
    public List<LeaveBalanceResponse> setBalance(long employeeId, String leaveType, BigDecimal days, Long actorUserId) {
        LeaveType type = LeaveType.parse(leaveType, "leaveType");
        if (type.usesAdjustmentHistory()) {
            throw ApiException.invalid("leaveType",
                    "The Comp-Off balance is changed by adding or deducting days with a reason.");
        }
        if (days == null || days.signum() < 0 || days.compareTo(MAX_BALANCE) > 0
                || days.multiply(BigDecimal.valueOf(2)).stripTrailingZeros().scale() > 0) {
            throw ApiException.invalid("balanceDays", "Enter a balance from 0 to 365 days, in half days (for example 7.5).");
        }
        Employee employee = employees.lockById(employeeId).orElseThrow(() -> ApiException.notFound("Employee not found."));
        LeaveBalance balance = balances.findForUpdateByEmployeeIdAndLeaveType(employee.getId(), type.name())
                .orElseGet(() -> LeaveBalance.start(employee.getId(), type));
        BigDecimal previous = balance.getBalanceDays();
        BigDecimal next = days.setScale(1, RoundingMode.UNNECESSARY);
        balance.set(next, actorUserId);
        balances.saveAndFlush(balance);
        audit.save(AuditEntry.of(actorUserId, "LEAVE_BALANCE_CHANGED", "EMPLOYEE", employee.getEmployeeCode(),
                "{\"leaveType\":\"" + type.name() + "\",\"previousDays\":" + previous.toPlainString()
                        + ",\"newDays\":" + next.toPlainString() + "}"));
        return balanceList(employee.getId());
    }

    /* ---------- Requests: employee ---------- */

    @Transactional(readOnly = true)
    public List<LeaveRequestResponse> myRequests(long userId) {
        Employee me = currentEmployee(userId);
        return requests.findByEmployeeIdOrderByStartDateDesc(me.getId()).stream()
                .map(r -> LeaveRequestResponse.from(r, me)).toList();
    }

    /** The signed-in employee applies for leave. Checked again here, whatever the app already checked. */
    @Transactional
    public LeaveRequestResponse apply(long userId, LeaveApplyRequest request) {
        Employee me = currentEmployee(userId);
        LeaveType type = LeaveType.parse(request.leaveType(), "leaveType");
        LocalDate start = request.startDate();
        LocalDate end = request.endDate();
        LocalDate today = LocalDate.now(clock);
        if (end.isBefore(start)) {
            throw ApiException.invalid("endDate", "The last day must be on or after the first day.");
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_SPAN_DAYS) {
            throw ApiException.invalid("endDate", "One request can cover at most " + MAX_SPAN_DAYS + " days.");
        }
        if (start.isBefore(today.minusDays(MAX_DAYS_BACK))) {
            throw ApiException.invalid("startDate", "Leave can start at most " + MAX_DAYS_BACK + " days ago.");
        }
        if (me.getJoiningDate() != null && start.isBefore(me.getJoiningDate())) {
            throw ApiException.invalid("startDate", "That date is before your joining date.");
        }
        String reason = cleanReason(request.reason());

        // One leave action per employee at a time (see class comment).
        employees.lockById(me.getId());
        BigDecimal days = workingDays(me.getId(), start, end);
        if (days.signum() == 0) {
            throw ApiException.invalid("endDate", "These dates are all weekly offs or company holidays, so no leave is needed.");
        }
        for (LeaveRequest other : requests.touching(me.getId(), start, end)) {
            if (!LeaveRequest.STATUS_REJECTED.equals(other.getStatus())) {
                throw ApiException.conflict("startDate", "You already have " + other.getStatus().toLowerCase(Locale.ROOT)
                        + " leave from " + DAY.format(other.getStartDate()) + " to " + DAY.format(other.getEndDate()) + ".");
            }
        }
        BigDecimal available = available(me.getId(), type);
        if (days.compareTo(available) > 0) {
            throw ApiException.invalid("leaveType", "Not enough " + type.label() + " leave: this request needs "
                    + plain(days) + " " + dayWord(days) + ", and you have " + plain(available) + " available.");
        }
        LeaveRequest saved = requests.saveAndFlush(LeaveRequest.apply(me.getId(), type, start, end, days, reason));
        return LeaveRequestResponse.from(saved, me);
    }

    /* ---------- Requests: HR ---------- */

    @Transactional(readOnly = true)
    public List<LeaveRequestResponse> requestsWithStatus(String status) {
        String wanted = status == null || status.isBlank() ? LeaveRequest.STATUS_PENDING : status.trim().toUpperCase(Locale.ROOT);
        if (!List.of(LeaveRequest.STATUS_PENDING, LeaveRequest.STATUS_APPROVED, LeaveRequest.STATUS_REJECTED).contains(wanted)) {
            throw ApiException.invalid("status", "Choose PENDING, APPROVED or REJECTED.");
        }
        List<LeaveRequest> rows = requests.findByStatusOrderByCreatedAtAsc(wanted);
        Map<Long, Employee> people = new HashMap<>();
        for (Employee e : employees.findAllById(rows.stream().map(LeaveRequest::getEmployeeId).collect(Collectors.toSet()))) {
            people.put(e.getId(), e);
        }
        return rows.stream().map(r -> LeaveRequestResponse.from(r, people.get(r.getEmployeeId()))).toList();
    }

    /**
     * HR approves: the days are taken off the balance now (once). If HR has
     * lowered the balance since the request was made and it no longer
     * covers it, the approval is refused with a clear message.
     */
    @Transactional
    public LeaveRequestResponse approve(long requestId, String note, Long reviewerUserId) {
        LeaveRequest request = pendingLocked(requestId);
        Employee employee = employees.findById(request.getEmployeeId())
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
        LeaveType type = LeaveType.valueOf(request.getLeaveType());
        LeaveBalance balance = balances.findForUpdateByEmployeeIdAndLeaveType(employee.getId(), type.name())
                .orElseGet(() -> LeaveBalance.start(employee.getId(), type));
        BigDecimal previous = balance.getBalanceDays();
        if (previous.compareTo(request.getDays()) < 0) {
            throw ApiException.conflict(null, employee.getEmployeeCode() + " has only " + plain(previous) + " "
                    + type.label() + " leave left, and this request needs " + plain(request.getDays())
                    + ". Update the balance or reject the request.");
        }
        BigDecimal next = previous.subtract(request.getDays());
        if (type.usesAdjustmentHistory()) {
            // The request is locked and still pending, so this runs once; the
            // unique leave_request_id column is a second guard in the database.
            if (adjustments.existsByLeaveRequestId(request.getId())) {
                throw ApiException.conflict(null, "This leave request was already taken off the balance.");
            }
            adjustments.saveAndFlush(LeaveBalanceAdjustment.approval(employee.getId(), type, previous, request.getDays(),
                    "Leave approved: " + DAY.format(request.getStartDate())
                            + (request.getEndDate().equals(request.getStartDate()) ? "" : " to " + DAY.format(request.getEndDate())),
                    request.getId(), reviewerUserId));
        }
        balance.set(next, reviewerUserId);
        balances.saveAndFlush(balance);
        request.decide(LeaveRequest.STATUS_APPROVED, reviewerUserId, clock.instant(), HrTimesheetService.cleanNote(note));
        requests.saveAndFlush(request);
        audit.save(AuditEntry.of(reviewerUserId, "LEAVE_APPROVED", "LEAVE_REQUEST", String.valueOf(request.getId()),
                "{\"leaveType\":\"" + type.name() + "\",\"days\":" + request.getDays().toPlainString()
                        + ",\"previousDays\":" + previous.toPlainString() + ",\"newDays\":" + next.toPlainString() + "}"));
        notifications.leaveDecided(employee, request, true);
        return LeaveRequestResponse.from(request, employee);
    }

    /** HR rejects: nothing is taken off the balance; the held days become available again. */
    @Transactional
    public LeaveRequestResponse reject(long requestId, String note, Long reviewerUserId) {
        LeaveRequest request = pendingLocked(requestId);
        Employee employee = employees.findById(request.getEmployeeId()).orElse(null);
        request.decide(LeaveRequest.STATUS_REJECTED, reviewerUserId, clock.instant(), HrTimesheetService.cleanNote(note));
        requests.saveAndFlush(request);
        audit.save(AuditEntry.of(reviewerUserId, "LEAVE_REJECTED", "LEAVE_REQUEST", String.valueOf(request.getId())));
        notifications.leaveDecided(employee, request, false);
        return LeaveRequestResponse.from(request, employee);
    }

    /** Locks the employee first, then the request (the same order as apply), and checks it is still pending. */
    private LeaveRequest pendingLocked(long requestId) {
        LeaveRequest peek = requests.findById(requestId).orElseThrow(() -> ApiException.notFound("Leave request not found."));
        employees.lockById(peek.getEmployeeId());
        LeaveRequest request = requests.findForUpdate(requestId)
                .orElseThrow(() -> ApiException.notFound("Leave request not found."));
        if (!LeaveRequest.STATUS_PENDING.equals(request.getStatus())) {
            throw ApiException.conflict(null, "This leave request was already " + request.getStatus().toLowerCase(Locale.ROOT) + ".");
        }
        return request;
    }

    /* ---------- Rules ---------- */

    /** Working days from start to end (both included): weekly offs and company holidays are not counted. */
    BigDecimal workingDays(long employeeId, LocalDate start, LocalDate end) {
        long count = calendarService.calendarFor(employeeId, start, end).days(start, end).stream()
                .filter(WorkCalendar.Day::working).count();
        return BigDecimal.valueOf(count).setScale(1);
    }

    private BigDecimal available(long employeeId, LeaveType type) {
        BigDecimal balance = balances.findByEmployeeId(employeeId).stream()
                .filter(b -> b.getLeaveType().equals(type.name())).map(LeaveBalance::getBalanceDays)
                .findFirst().orElse(zero());
        return balance.subtract(requests.pendingDays(employeeId, type.name())).max(zero());
    }

    private Employee currentEmployee(long userId) {
        return employees.findByUser_Id(userId).orElseThrow(() -> ApiException.notFound("Employee record not found."));
    }

    private static String cleanReason(String reason) {
        String value = reason == null ? "" : reason.replaceAll("[\\p{Cntrl}&&[^\\n]]", " ").strip();
        if (value.isEmpty()) {
            throw ApiException.invalid("reason", "Give a reason.");
        }
        if (value.length() > 500) {
            throw ApiException.invalid("reason", "Reason must be at most 500 characters.");
        }
        return value;
    }

    private static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(1);
    }

    private static String plain(BigDecimal value) {
        return TimesheetService.plain(value);
    }

    private static String dayWord(BigDecimal days) {
        return days.compareTo(BigDecimal.ONE) == 0 ? "day" : "days";
    }
}
