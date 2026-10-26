package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * HR: the Comp-Off balance of one employee and its history.
 *
 * <p>Rules:
 * <ul>
 *   <li>Comp-Off is earned through employee requests that HR approves
 *       (CompOffRequestService). HR can still add or deduct days here, for
 *       corrections only (half days allowed); every change needs a reason
 *       and is kept, with who made it and when.</li>
 *   <li>The balance stays between 0 and 365 days.</li>
 *   <li>The app sends a unique key with each change. If the same change arrives
 *       twice (double tap, retry after a lost reply) it is applied only once.</li>
 *   <li>Requests and approvals use the normal leave workflow (LeaveService):
 *       nothing is taken off while a request is pending or when it is rejected,
 *       and approving takes the days off exactly once.</li>
 * </ul>
 * Each change locks the employee row first (the same lock every leave action
 * uses), so changes and approvals for one employee never run at the same time.
 */
@Service
public class CompOffService {

    static final BigDecimal MAX_BALANCE = BigDecimal.valueOf(365);
    private static final Pattern REQUEST_KEY = Pattern.compile("^[A-Za-z0-9-]{8,64}$");
    private static final LeaveType TYPE = LeaveType.COMP_OFF;

    private final LeaveBalanceRepository balances;
    private final LeaveRequestRepository requests;
    private final LeaveBalanceAdjustmentRepository adjustments;
    private final EmployeeRepository employees;
    private final AppUserRepository users;
    private final AuditEntryRepository audit;
    private final NotificationService notifications;

    public CompOffService(
            LeaveBalanceRepository balances,
            LeaveRequestRepository requests,
            LeaveBalanceAdjustmentRepository adjustments,
            EmployeeRepository employees,
            AppUserRepository users,
            AuditEntryRepository audit) {
        this(balances, requests, adjustments, employees, users, audit, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public CompOffService(
            LeaveBalanceRepository balances,
            LeaveRequestRepository requests,
            LeaveBalanceAdjustmentRepository adjustments,
            EmployeeRepository employees,
            AppUserRepository users,
            AuditEntryRepository audit,
            NotificationService notifications) {
        this.balances = balances;
        this.requests = requests;
        this.adjustments = adjustments;
        this.employees = employees;
        this.users = users;
        this.audit = audit;
        this.notifications = notifications;
    }

    /** The current balance, days waiting for HR, and the change history (newest first). */
    @Transactional(readOnly = true)
    public CompOffResponse summary(long employeeId) {
        Employee employee = employees.findById(employeeId).orElseThrow(() -> ApiException.notFound("Employee not found."));
        return summaryOf(employee.getId());
    }

    /** HR adds (positive) or deducts (negative) Comp-Off days, with a reason. */
    @Transactional
    public CompOffResponse adjust(long employeeId, CompOffAdjustmentRequest request, Long actorUserId) {
        BigDecimal change = checkChange(request.changeDays());
        String reason = checkReason(request.reason());
        String key = checkKey(request.requestKey());

        Employee employee = employees.lockById(employeeId).orElseThrow(() -> ApiException.notFound("Employee not found."));

        // The same change sent again: nothing more is applied.
        Optional<LeaveBalanceAdjustment> earlier = adjustments.findByRequestKey(key);
        if (earlier.isPresent()) {
            if (!earlier.get().getEmployeeId().equals(employee.getId())) {
                throw ApiException.conflict("requestKey", "This change was already used for another employee. Try again.");
            }
            return summaryOf(employee.getId());
        }

        LeaveBalance balance = balances.findForUpdateByEmployeeIdAndLeaveType(employee.getId(), TYPE.name())
                .orElseGet(() -> LeaveBalance.start(employee.getId(), TYPE));
        BigDecimal before = balance.getBalanceDays().setScale(1, RoundingMode.HALF_UP);
        BigDecimal after = before.add(change);
        if (after.signum() < 0) {
            throw ApiException.invalid("changeDays", "You can deduct at most " + plain(before)
                    + " " + dayWord(before) + ": the Comp-Off balance is " + plain(before) + ".");
        }
        if (after.compareTo(MAX_BALANCE) > 0) {
            throw ApiException.invalid("changeDays", "The Comp-Off balance can be at most 365 days.");
        }

        balance.set(after, actorUserId);
        balances.saveAndFlush(balance);
        try {
            adjustments.saveAndFlush(LeaveBalanceAdjustment.manual(
                    employee.getId(), TYPE, before, change, reason, key, actorUserId));
        } catch (DataIntegrityViolationException e) {
            // Another request with the same key won the race; this one is undone.
            throw ApiException.conflict("requestKey", "This change was already saved. Refresh to see it.");
        }
        audit.save(AuditEntry.of(actorUserId, "COMP_OFF_ADJUSTED", "EMPLOYEE", employee.getEmployeeCode(),
                "{\"changeDays\":" + change.toPlainString() + ",\"previousDays\":" + before.toPlainString()
                        + ",\"newDays\":" + after.toPlainString() + "}"));
        if (notifications != null) {
            notifications.compOffBalanceUpdated(employee, change, after, reason);
        }
        return summaryOf(employee.getId());
    }

    private CompOffResponse summaryOf(long employeeId) {
        BigDecimal balance = balances.findByEmployeeId(employeeId).stream()
                .filter(b -> b.getLeaveType().equals(TYPE.name()))
                .map(b -> b.getBalanceDays().setScale(1, RoundingMode.HALF_UP))
                .findFirst().orElse(zero());
        BigDecimal pending = requests.pendingDays(employeeId, TYPE.name()).setScale(1, RoundingMode.HALF_UP);
        List<LeaveBalanceAdjustment> rows =
                adjustments.findTop200ByEmployeeIdAndLeaveTypeOrderByCreatedAtDescIdDesc(employeeId, TYPE.name());
        Map<Long, String> names = new HashMap<>();
        List<CompOffAdjustmentResponse> history = rows.stream()
                .map(a -> CompOffAdjustmentResponse.from(a, a.getCreatedBy() == null ? null
                        : names.computeIfAbsent(a.getCreatedBy(), this::nameOf)))
                .toList();
        return new CompOffResponse(employeeId, balance, pending, balance.subtract(pending).max(zero()), history);
    }

    /** "Priya Shah" when the person has an employee record, otherwise their sign-in ID or email. */
    private String nameOf(Long userId) {
        Optional<Employee> person = employees.findByUser_Id(userId);
        if (person.isPresent()) {
            String name = (person.get().getFirstName() + " " + person.get().getLastName()).trim();
            if (!name.isEmpty()) {
                return name;
            }
        }
        return users.findById(userId)
                .map(u -> u.getLoginId() != null && !u.getLoginId().isBlank() ? u.getLoginId() : u.getEmail())
                .orElse("Unknown user");
    }

    /* ---------- Checks (the app checks the same things first) ---------- */

    static BigDecimal checkChange(BigDecimal value) {
        if (value == null) {
            throw ApiException.invalid("changeDays", "Enter the number of days.");
        }
        if (value.signum() == 0) {
            throw ApiException.invalid("changeDays", "Enter a number of days other than 0.");
        }
        if (value.abs().compareTo(MAX_BALANCE) > 0
                || value.multiply(BigDecimal.valueOf(2)).stripTrailingZeros().scale() > 0) {
            throw ApiException.invalid("changeDays", "Enter up to 365 days, in half days (for example 1 or 0.5).");
        }
        return value.setScale(1, RoundingMode.UNNECESSARY);
    }

    static String checkReason(String reason) {
        String value = reason == null ? "" : reason.replaceAll("[\\p{Cntrl}&&[^\\n]]", " ").strip();
        if (value.length() < 3) {
            throw ApiException.invalid("reason", "Give a reason (at least 3 characters).");
        }
        if (value.length() > 500) {
            throw ApiException.invalid("reason", "Reason must be at most 500 characters.");
        }
        return value;
    }

    static String checkKey(String key) {
        if (key == null || !REQUEST_KEY.matcher(key).matches()) {
            throw ApiException.invalid("requestKey", "This change could not be identified. Refresh and try again.");
        }
        return key;
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
