package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One Comp-Off balance change: MANUAL (an HR correction, with a reason),
 * LEAVE_APPROVED (Comp-Off leave taken) or COMP_OFF_EARNED (an approved
 * Comp-Off request credited).
 */
public record CompOffAdjustmentResponse(
    long id,
    String source,
    BigDecimal changeDays,
    BigDecimal balanceBefore,
    BigDecimal balanceAfter,
    String reason,
    Long leaveRequestId,
    Long compOffRequestId,
    String changedBy,
    Instant changedAt
) {

    static CompOffAdjustmentResponse from(LeaveBalanceAdjustment a, String changedBy) {
        return new CompOffAdjustmentResponse(a.getId(), a.getSource(), a.getChangeDays(), a.getBalanceBefore(),
                a.getBalanceAfter(), a.getReason(), a.getLeaveRequestId(), a.getCompOffRequestId(),
                changedBy, a.getCreatedAt());
    }
}
