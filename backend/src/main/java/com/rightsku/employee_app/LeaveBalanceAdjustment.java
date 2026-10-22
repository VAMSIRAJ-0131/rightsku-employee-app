package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * One change to an employee's Comp-Off balance (table leave_balance_adjustments, V9):
 * either HR's manual addition or deduction (always with a reason), or the days
 * taken off when HR approved a Comp-Off leave request. Never updated or deleted.
 */
@Entity
@Table(name = "leave_balance_adjustments")
public class LeaveBalanceAdjustment {

    public static final String SOURCE_MANUAL = "MANUAL";
    public static final String SOURCE_LEAVE_APPROVED = "LEAVE_APPROVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false, updatable = false)
    private Long employeeId;

    @Column(name = "leave_type", nullable = false, length = 20, updatable = false)
    private String leaveType;

    @Column(nullable = false, length = 20, updatable = false)
    private String source;

    @Column(name = "change_days", nullable = false, precision = 5, scale = 1, updatable = false)
    private BigDecimal changeDays;

    @Column(name = "balance_before", nullable = false, precision = 5, scale = 1, updatable = false)
    private BigDecimal balanceBefore;

    @Column(name = "balance_after", nullable = false, precision = 5, scale = 1, updatable = false)
    private BigDecimal balanceAfter;

    @Column(nullable = false, length = 500, updatable = false)
    private String reason;

    @Column(name = "leave_request_id", updatable = false)
    private Long leaveRequestId;

    @Column(name = "request_key", length = 64, updatable = false)
    private String requestKey;

    @Column(name = "created_by", updatable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected LeaveBalanceAdjustment() {
    }

    /** HR's manual change, identified by the key the app sent with it. */
    static LeaveBalanceAdjustment manual(Long employeeId, LeaveType type, BigDecimal before, BigDecimal change,
                                         String reason, String requestKey, Long actorUserId) {
        LeaveBalanceAdjustment a = base(employeeId, type, before, change, reason, actorUserId);
        a.source = SOURCE_MANUAL;
        a.requestKey = requestKey;
        return a;
    }

    /** The days taken off when HR approved one Comp-Off leave request. */
    static LeaveBalanceAdjustment approval(Long employeeId, LeaveType type, BigDecimal before, BigDecimal days,
                                           String reason, Long leaveRequestId, Long reviewerUserId) {
        LeaveBalanceAdjustment a = base(employeeId, type, before, days.negate(), reason, reviewerUserId);
        a.source = SOURCE_LEAVE_APPROVED;
        a.leaveRequestId = leaveRequestId;
        return a;
    }

    private static LeaveBalanceAdjustment base(Long employeeId, LeaveType type, BigDecimal before, BigDecimal change,
                                               String reason, Long actorUserId) {
        LeaveBalanceAdjustment a = new LeaveBalanceAdjustment();
        a.employeeId = employeeId;
        a.leaveType = type.name();
        a.changeDays = change;
        a.balanceBefore = before;
        a.balanceAfter = before.add(change);
        a.reason = reason;
        a.createdBy = actorUserId;
        return a;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Long getEmployeeId() {
        return employeeId;
    }

    public String getLeaveType() {
        return leaveType;
    }

    public String getSource() {
        return source;
    }

    public BigDecimal getChangeDays() {
        return changeDays;
    }

    public BigDecimal getBalanceBefore() {
        return balanceBefore;
    }

    public BigDecimal getBalanceAfter() {
        return balanceAfter;
    }

    public String getReason() {
        return reason;
    }

    public Long getLeaveRequestId() {
        return leaveRequestId;
    }

    public String getRequestKey() {
        return requestKey;
    }

    public Long getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
