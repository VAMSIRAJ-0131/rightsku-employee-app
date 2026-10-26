package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * An employee's request to change personal details (table
 * profile_change_requests, V19): PENDING, then APPROVED (the new values are
 * saved once) or REJECTED by HR, or CANCELLED by the employee. "changes" and
 * "previous" are small JSON objects of field key to value.
 */
@Entity
@Table(name = "profile_change_requests")
public class ProfileChangeRequest {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_CANCELLED = "CANCELLED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String changes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String previous;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "review_note", length = 500)
    private String reviewNote;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ProfileChangeRequest() {
    }

    static ProfileChangeRequest ask(Long employeeId, String changesJson, String previousJson) {
        ProfileChangeRequest r = new ProfileChangeRequest();
        r.employeeId = employeeId;
        r.changes = changesJson;
        r.previous = previousJson;
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

    public String getChanges() {
        return changes;
    }

    public String getPrevious() {
        return previous;
    }

    public String getStatus() {
        return status;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public String getReviewNote() {
        return reviewNote;
    }

    public Instant getCancelledAt() {
        return cancelledAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
