package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Comp-Off requests: an employee who worked on a weekly off or company holiday
 * asks for Comp-Off, and HR's approval credits it to the Comp-Off balance.
 *
 * <ul>
 *   <li>The day must be in the past, at most 30 days ago, on or after the
 *       joining date, and a weekly off or company holiday in that employee's
 *       own calendar (their HR schedule on that date).</li>
 *   <li>Full day (1) or half day (0.5). One pending or approved request per
 *       day; a rejected one can be asked for again.</li>
 *   <li>Approving credits the days exactly once: the employee row and the
 *       request are locked, the request must still be pending, and the
 *       history row's unique comp_off_request_id is a second guard in the
 *       database. Rejecting credits nothing.</li>
 *   <li>Every decision is kept in the Comp-Off history and the audit log, and
 *       the employee gets a notification.</li>
 * </ul>
 */
@Service
public class CompOffRequestService {

    static final int MAX_DAYS_BACK = 30;
    private static final BigDecimal FULL_DAY = new BigDecimal("1.0");
    private static final BigDecimal HALF_DAY = new BigDecimal("0.5");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final CompOffRequestRepository requests;
    private final LeaveBalanceRepository balances;
    private final LeaveBalanceAdjustmentRepository adjustments;
    private final EmployeeRepository employees;
    private final WorkCalendarService calendars;
    private final NotificationService notifications;
    private final AuditEntryRepository audit;
    private final Clock clock;

    public CompOffRequestService(
            CompOffRequestRepository requests,
            LeaveBalanceRepository balances,
            LeaveBalanceAdjustmentRepository adjustments,
            EmployeeRepository employees,
            WorkCalendarService calendars,
            NotificationService notifications,
            AuditEntryRepository audit,
            Clock clock) {
        this.requests = requests;
        this.balances = balances;
        this.adjustments = adjustments;
        this.employees = employees;
        this.calendars = calendars;
        this.notifications = notifications;
        this.audit = audit;
        this.clock = clock;
    }

    /* ---------- Employee ---------- */

    @Transactional(readOnly = true)
    public List<CompOffRequestResponse> mine(long userId) {
        Employee me = currentEmployee(userId);
        return requests.findByEmployeeIdOrderByWorkDateDescIdDesc(me.getId()).stream()
                .map(r -> response(r, me)).toList();
    }

    /** The signed-in employee asks for Comp-Off. Checked here, whatever the app already checked. */
    @Transactional
    public CompOffRequestResponse apply(long userId, CompOffApplyRequest request) {
        Employee me = currentEmployee(userId);
        LocalDate day = request.workDate();
        LocalDate today = LocalDate.now(clock);
        BigDecimal days = checkDays(request.days());
        String reason = CompOffService.checkReason(request.reason());
        if (!day.isBefore(today)) {
            throw ApiException.invalid("workDate", "Choose a day that has already passed.");
        }
        if (day.isBefore(today.minusDays(MAX_DAYS_BACK))) {
            throw ApiException.invalid("workDate", "Comp-Off can be asked for at most " + MAX_DAYS_BACK + " days later.");
        }
        if (me.getJoiningDate() != null && day.isBefore(me.getJoiningDate())) {
            throw ApiException.invalid("workDate", "That date is before your joining date.");
        }
        WorkCalendar.Day plan = calendars.calendarFor(me.getId(), day, day).day(day);
        if (plan.working()) {
            throw ApiException.invalid("workDate", DAY.format(day)
                    + " was a working day for you. Comp-Off is for work on a weekly off or company holiday.");
        }

        // One leave action per employee at a time (the same lock as leave and Comp-Off changes).
        employees.lockById(me.getId());
        List<CompOffRequest> existing = requests.activeOn(me.getId(), day);
        if (!existing.isEmpty()) {
            throw ApiException.conflict("workDate", "You already have a "
                    + existing.get(0).getStatus().toLowerCase(Locale.ROOT) + " Comp-Off request for " + DAY.format(day) + ".");
        }
        CompOffRequest saved;
        try {
            saved = requests.saveAndFlush(CompOffRequest.apply(me.getId(), day, days, reason));
        } catch (DataIntegrityViolationException e) {
            // A second request for the same day arrived at the same moment (double tap).
            throw ApiException.conflict("workDate", "You already have a Comp-Off request for " + DAY.format(day) + ".");
        }
        return CompOffRequestResponse.from(saved, me, plan);
    }

    /** The employee withdraws their own pending request; HR is told. Someone else's answers 404. */
    @Transactional
    public CompOffRequestResponse cancel(long userId, long requestId) {
        Employee me = currentEmployee(userId);
        employees.lockById(me.getId());
        CompOffRequest request = requests.findForUpdate(requestId)
                .filter(r -> r.getEmployeeId().equals(me.getId()))
                .orElseThrow(() -> ApiException.notFound("Comp-Off request not found."));
        if (!CompOffRequest.STATUS_PENDING.equals(request.getStatus())) {
            throw ApiException.conflict(null, "This Comp-Off request was already "
                    + request.getStatus().toLowerCase(Locale.ROOT) + ", so it can't be cancelled.");
        }
        request.cancel(clock.instant());
        requests.saveAndFlush(request);
        audit.save(AuditEntry.of(userId, "COMP_OFF_CANCELLED", "COMP_OFF_REQUEST", String.valueOf(request.getId())));
        notifications.compOffCancelled(me, request);
        return response(request, me);
    }

    /* ---------- HR ---------- */

    @Transactional(readOnly = true)
    public List<CompOffRequestResponse> withStatus(String status) {
        String wanted = status == null || status.isBlank() ? CompOffRequest.STATUS_PENDING
                : status.trim().toUpperCase(Locale.ROOT);
        if (!List.of(CompOffRequest.STATUS_PENDING, CompOffRequest.STATUS_APPROVED, CompOffRequest.STATUS_REJECTED)
                .contains(wanted)) {
            throw ApiException.invalid("status", "Choose PENDING, APPROVED or REJECTED.");
        }
        List<CompOffRequest> rows = requests.findByStatusOrderByCreatedAtAsc(wanted);
        Map<Long, Employee> people = new HashMap<>();
        for (Employee e : employees.findAllById(rows.stream().map(CompOffRequest::getEmployeeId).collect(Collectors.toSet()))) {
            people.put(e.getId(), e);
        }
        return rows.stream().map(r -> response(r, people.get(r.getEmployeeId()))).toList();
    }

    /** HR approves: the days are added to the Comp-Off balance now, exactly once. */
    @Transactional
    public CompOffRequestResponse approve(long requestId, String note, Long reviewerUserId) {
        CompOffRequest request = pendingLocked(requestId);
        Employee employee = employees.findById(request.getEmployeeId())
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
        LeaveBalance balance = balances.findForUpdateByEmployeeIdAndLeaveType(employee.getId(), LeaveType.COMP_OFF.name())
                .orElseGet(() -> LeaveBalance.start(employee.getId(), LeaveType.COMP_OFF));
        BigDecimal before = balance.getBalanceDays().setScale(1, RoundingMode.HALF_UP);
        BigDecimal after = before.add(request.getDays());
        if (after.compareTo(CompOffService.MAX_BALANCE) > 0) {
            throw ApiException.conflict(null, employee.getEmployeeCode()
                    + "'s Comp-Off balance can be at most 365 days. Reject the request or correct the balance first.");
        }
        // The request is locked and still pending, so this runs once; the unique
        // comp_off_request_id column is a second guard in the database.
        if (adjustments.existsByCompOffRequestId(request.getId())) {
            throw ApiException.conflict(null, "This Comp-Off request was already credited.");
        }
        adjustments.saveAndFlush(LeaveBalanceAdjustment.earned(employee.getId(), before, request.getDays(),
                "Comp-Off approved: worked on " + DAY.format(request.getWorkDate()), request.getId(), reviewerUserId));
        balance.set(after, reviewerUserId);
        balances.saveAndFlush(balance);
        request.decide(CompOffRequest.STATUS_APPROVED, reviewerUserId, clock.instant(), HrTimesheetService.cleanNote(note));
        requests.saveAndFlush(request);
        audit.save(AuditEntry.of(reviewerUserId, "COMP_OFF_CREDITED", "COMP_OFF_REQUEST", String.valueOf(request.getId()),
                "{\"days\":" + request.getDays().toPlainString() + ",\"previousDays\":" + before.toPlainString()
                        + ",\"newDays\":" + after.toPlainString() + "}"));
        notifications.compOffDecided(employee, request, true);
        return response(request, employee);
    }

    /** HR rejects: nothing is credited. */
    @Transactional
    public CompOffRequestResponse reject(long requestId, String note, Long reviewerUserId) {
        CompOffRequest request = pendingLocked(requestId);
        Employee employee = employees.findById(request.getEmployeeId()).orElse(null);
        request.decide(CompOffRequest.STATUS_REJECTED, reviewerUserId, clock.instant(), HrTimesheetService.cleanNote(note));
        requests.saveAndFlush(request);
        audit.save(AuditEntry.of(reviewerUserId, "COMP_OFF_REJECTED", "COMP_OFF_REQUEST", String.valueOf(request.getId())));
        notifications.compOffDecided(employee, request, false);
        return response(request, employee);
    }

    /** Pending, approved and rejected counts for the Approvals screen. */
    @Transactional(readOnly = true)
    public ApprovalSummaryResponse.Counts counts() {
        Map<String, Long> byStatus = new HashMap<>();
        for (Object[] row : requests.countByStatusGrouped()) {
            byStatus.put((String) row[0], ((Number) row[1]).longValue());
        }
        return new ApprovalSummaryResponse.Counts(
                byStatus.getOrDefault(CompOffRequest.STATUS_PENDING, 0L),
                byStatus.getOrDefault(CompOffRequest.STATUS_APPROVED, 0L),
                byStatus.getOrDefault(CompOffRequest.STATUS_REJECTED, 0L));
    }

    /** Locks the employee first, then the request (the same order as apply), and checks it is still pending. */
    private CompOffRequest pendingLocked(long requestId) {
        CompOffRequest peek = requests.findById(requestId)
                .orElseThrow(() -> ApiException.notFound("Comp-Off request not found."));
        employees.lockById(peek.getEmployeeId());
        CompOffRequest request = requests.findForUpdate(requestId)
                .orElseThrow(() -> ApiException.notFound("Comp-Off request not found."));
        if (!CompOffRequest.STATUS_PENDING.equals(request.getStatus())) {
            throw ApiException.conflict(null,
                    "This Comp-Off request was already " + request.getStatus().toLowerCase(Locale.ROOT) + ".");
        }
        return request;
    }

    private CompOffRequestResponse response(CompOffRequest r, Employee e) {
        WorkCalendar.Day day = calendars.calendarFor(r.getEmployeeId(), r.getWorkDate(), r.getWorkDate()).day(r.getWorkDate());
        return CompOffRequestResponse.from(r, e, day);
    }

    static BigDecimal checkDays(BigDecimal value) {
        if (value == null) {
            throw ApiException.invalid("days", "Choose full day or half day.");
        }
        if (value.compareTo(FULL_DAY) == 0) {
            return FULL_DAY;
        }
        if (value.compareTo(HALF_DAY) == 0) {
            return HALF_DAY;
        }
        throw ApiException.invalid("days", "Choose full day (1) or half day (0.5).");
    }

    private Employee currentEmployee(long userId) {
        return employees.findByUser_Id(userId).orElseThrow(() -> ApiException.notFound("Employee record not found."));
    }
}
