package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

/**
 * Paid leave is available when any leave type (Casual, Sick, Earned,
 * Comp-Off; all paid) has at least one whole day left after the days already
 * waiting for approval. Leave is applied for in whole days, so less than one
 * day can't cover an absence.
 */
@Component
public class LeaveBalancePaidLeaveCheck implements PaidLeaveCheck {

    private final LeaveBalanceRepository balances;
    private final LeaveRequestRepository requests;

    public LeaveBalancePaidLeaveCheck(LeaveBalanceRepository balances, LeaveRequestRepository requests) {
        this.balances = balances;
        this.requests = requests;
    }

    @Override
    public boolean hasPaidLeaveAvailable(long employeeId) {
        Map<String, BigDecimal> saved = balances.findByEmployeeId(employeeId).stream()
                .collect(Collectors.toMap(LeaveBalance::getLeaveType, LeaveBalance::getBalanceDays, (a, b) -> a));
        for (LeaveType type : LeaveType.values()) {
            BigDecimal balance = saved.getOrDefault(type.name(), BigDecimal.ZERO);
            BigDecimal pending = requests.pendingDays(employeeId, type.name());
            if (balance.subtract(pending == null ? BigDecimal.ZERO : pending).compareTo(BigDecimal.ONE) >= 0) {
                return true;
            }
        }
        return false;
    }
}
