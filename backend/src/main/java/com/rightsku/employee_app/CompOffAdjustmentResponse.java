package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;

/** One Comp-Off balance change: MANUAL (HR, with a reason) or LEAVE_APPROVED (an approved request). */
public record CompOffAdjustmentResponse(
    long id,
    String source,
    BigDecimal changeDays,
    BigDecimal balanceBefore,
    BigDecimal balanceAfter,
    String reason,
    Long leaveRequestId,
    String changedBy,
    Instant changedAt
) {

    static CompOffAdjustmentResponse from(LeaveBalanceAdjustment a, String changedBy) {
        return new CompOffAdjustmentResponse(a.getId(), a.getSource(), a.getChangeDays(), a.getBalanceBefore(),
                a.getBalanceAfter(), a.getReason(), a.getLeaveRequestId(), changedBy, a.getCreatedAt());
    }
}
