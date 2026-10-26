package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** A leave application (table leave_requests, V8): PENDING, then APPROVED or REJECTED by HR. */
@Entity
@Table(name = "leave_requests")
public class LeaveRequest {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    /** Withdrawn by the employee while still pending (V19). */
    public static final String STATUS_CANCELLED = "CANCELLED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "leave_type", nullable = false, length = 20)
    private String leaveType;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(nullable = false, precision = 5, scale = 1)
    private BigDecimal days;

    @Column(nullable = false, length = 500)
    private String reason;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "review_note", length = 500)
    private String reviewNote;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected LeaveRequest() {
    }

    public static LeaveRequest apply(Long employeeId, LeaveType type, LocalDate start, LocalDate end, BigDecimal days, String reason) {
        LeaveRequest r = new LeaveRequest();
        r.employeeId = employeeId;
        r.leaveType = type.name();
        r.startDate = start;
        r.endDate = end;
        r.days = days;
        r.reason = reason;
        r.status = STATUS_PENDING;
        return r;
    }

    void decide(String newStatus, Long reviewer, Instant at, String note) {
        if (!STATUS_PENDING.equals(status)) {
            throw new IllegalStateException("Only a pending request can be decided.");
        }
        this.status = newStatus;
        this.reviewedBy = reviewer;
        this.reviewedAt = at;
        this.reviewNote = note;
    }

    /** The employee withdraws the leave request: only while it is still pending. */
    void cancel(Instant at) {
        if (!STATUS_PENDING.equals(status)) {
            throw new IllegalStateException("Only a pending request can be cancelled.");
        }
        this.status = STATUS_CANCELLED;
        this.cancelledAt = at;
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

    public Long getId() {
        return id;
    }

    public Long getEmployeeId() {
        return employeeId;
    }

    public String getLeaveType() {
        return leaveType;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public BigDecimal getDays() {
        return days;
    }

    public String getReason() {
        return reason;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCancelledAt() {
        return cancelledAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public String getReviewNote() {
        return reviewNote;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
