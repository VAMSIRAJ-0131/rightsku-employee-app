package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** When does an employee still have paid leave? At least one whole day of any type, after pending requests. */
class LeaveBalancePaidLeaveCheckTest {

    private LeaveBalanceRepository balances;
    private LeaveRequestRepository requests;
    private LeaveBalancePaidLeaveCheck check;

    @BeforeEach
    void setUp() {
        balances = mock(LeaveBalanceRepository.class);
        requests = mock(LeaveRequestRepository.class);
        check = new LeaveBalancePaidLeaveCheck(balances, requests);
        when(requests.pendingDays(anyLong(), anyString())).thenReturn(BigDecimal.ZERO);
    }

    private static LeaveBalance balance(LeaveType type, String days) {
        LeaveBalance b = LeaveBalance.start(10L, type);
        b.set(new BigDecimal(days), 1L);
        return b;
    }

    @Test
    void noBalanceAtAllMeansNoPaidLeave() {
        when(balances.findByEmployeeId(10L)).thenReturn(List.of());
        assertThat(check.hasPaidLeaveAvailable(10L)).isFalse();
    }

    @Test
    void anyTypeWithAWholeDayLeftCounts() {
        when(balances.findByEmployeeId(10L)).thenReturn(List.of(balance(LeaveType.CASUAL, "0"), balance(LeaveType.SICK, "1")));
        assertThat(check.hasPaidLeaveAvailable(10L)).isTrue();
    }

    @Test
    void compOffIsPaidLeaveToo() {
        when(balances.findByEmployeeId(10L)).thenReturn(List.of(balance(LeaveType.COMP_OFF, "2")));
        assertThat(check.hasPaidLeaveAvailable(10L)).isTrue();
    }

    @Test
    void daysAlreadyWaitingForApprovalAreNotAvailable() {
        when(balances.findByEmployeeId(10L)).thenReturn(List.of(balance(LeaveType.CASUAL, "2")));
        when(requests.pendingDays(eq(10L), eq("CASUAL"))).thenReturn(new BigDecimal("2"));
        assertThat(check.hasPaidLeaveAvailable(10L)).isFalse();
    }

    @Test
    void halfADayLeftCannotCoverAWholeDay() {
        when(balances.findByEmployeeId(10L)).thenReturn(List.of(balance(LeaveType.EARNED, "0.5")));
        assertThat(check.hasPaidLeaveAvailable(10L)).isFalse();
    }
}
