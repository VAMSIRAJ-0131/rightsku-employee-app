package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.TreeMap;

/**
 * One employee's week (table timesheet_weeks, V7): a draft that can be saved
 * and changed, then submitted once for approval.
 * The draft hours live in timesheet_draft_days until the week is submitted.
 */
@Entity
@Table(name = "timesheet_weeks")
public class TimesheetWeek {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_SUBMITTED = "SUBMITTED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "week_start", nullable = false)
    private LocalDate weekStart;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(length = 500)
    private String description;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @ElementCollection
    @CollectionTable(name = "timesheet_draft_days", joinColumns = @JoinColumn(name = "week_id"))
    @MapKeyColumn(name = "work_date")
    @Column(name = "hours", nullable = false, precision = 4, scale = 2)
    private Map<LocalDate, BigDecimal> draftHours = new TreeMap<>();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected TimesheetWeek() {
    }

    public static TimesheetWeek start(Long employeeId, LocalDate weekStart) {
        TimesheetWeek w = new TimesheetWeek();
        w.employeeId = employeeId;
        w.weekStart = weekStart;
        w.status = STATUS_DRAFT;
        return w;
    }

    /** Replaces the draft with these hours and description. Only for a draft. */
    void saveDraft(Map<LocalDate, BigDecimal> hours, String description) {
        requireDraft();
        draftHours.clear();
        draftHours.putAll(hours);
        this.description = description;
    }

    /** Drops one day from the draft (that day was submitted on its own). */
    void removeDraftDay(LocalDate date) {
        requireDraft();
        draftHours.remove(date);
    }

    /** Marks the week as sent for approval; the draft hours are no longer needed. */
    void markSubmitted(String description, Instant at) {
        requireDraft();
        draftHours.clear();
        this.description = description;
        this.status = STATUS_SUBMITTED;
        this.submittedAt = at;
    }

    private void requireDraft() {
        if (isSubmitted()) {
            throw new IllegalStateException("A submitted week can't be changed.");
        }
    }

    public boolean isSubmitted() {
        return STATUS_SUBMITTED.equals(status);
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

    public LocalDate getWeekStart() {
        return weekStart;
    }

    public String getStatus() {
        return status;
    }

    public String getDescription() {
        return description;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Map<LocalDate, BigDecimal> getDraftHours() {
        return Map.copyOf(draftHours);
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
