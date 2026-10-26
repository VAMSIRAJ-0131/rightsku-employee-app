package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * An employee's request for Comp-Off after working on a weekly off or company
 * holiday (table comp_off_requests, V14): PENDING, then APPROVED (the days are
 * credited to the Comp-Off balance once) or REJECTED by HR.
 */
@Entity
@Table(name = "comp_off_requests")
public class CompOffRequest {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    /** Withdrawn by the employee while still pending (V19). */
    public static final String STATUS_CANCELLED = "CANCELLED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false, updatable = false)
    private Long employeeId;

    @Column(name = "work_date", nullable = false, updatable = false)
    private LocalDate workDate;

    @Column(nullable = false, precision = 2, scale = 1, updatable = false)
    private BigDecimal days;

    @Column(nullable = false, length = 500, updatable = false)
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

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CompOffRequest() {
    }

    public static CompOffRequest apply(Long employeeId, LocalDate workDate, BigDecimal days, String reason) {
        CompOffRequest r = new CompOffRequest();
        r.employeeId = employeeId;
        r.workDate = workDate;
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

    /** The employee withdraws the Comp-Off request: only while it is still pending. */
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

    public LocalDate getWorkDate() {
        return workDate;
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

    public Long getReviewedBy() {
        return reviewedBy;
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
