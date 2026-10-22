package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

/** Leave left for one employee and leave type, set by HR (table leave_balances, V8). */
@Entity
@Table(name = "leave_balances")
public class LeaveBalance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "leave_type", nullable = false, length = 20)
    private String leaveType;

    @Column(name = "balance_days", nullable = false, precision = 5, scale = 1)
    private BigDecimal balanceDays;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected LeaveBalance() {
    }

    public static LeaveBalance start(Long employeeId, LeaveType type) {
        LeaveBalance b = new LeaveBalance();
        b.employeeId = employeeId;
        b.leaveType = type.name();
        b.balanceDays = BigDecimal.ZERO.setScale(1);
        return b;
    }

    void set(BigDecimal days, Long actorUserId) {
        this.balanceDays = days;
        this.updatedBy = actorUserId;
    }

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getEmployeeId() {
        return employeeId;
    }

    public String getLeaveType() {
        return leaveType;
    }

    public BigDecimal getBalanceDays() {
        return balanceDays;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
