package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;

/**
 * An employee's working schedule from a given date (table
 * employee_work_schedules, V6). Set by HR.
 */
@Entity
@Table(name = "employee_work_schedules")
public class WorkSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    /** See WorkCalendar.toMask: Monday = 1 ... Sunday = 64. */
    @Column(name = "weekly_off_mask", nullable = false)
    private short weeklyOffMask;

    @Column(name = "hours_per_day", nullable = false, precision = 4, scale = 2)
    private BigDecimal hoursPerDay;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected WorkSchedule() {
    }

    public static WorkSchedule create(
            Long employeeId, LocalDate effectiveFrom, Set<DayOfWeek> weeklyOffs, BigDecimal hoursPerDay, Long actor) {
        WorkSchedule s = new WorkSchedule();
        s.employeeId = employeeId;
        s.effectiveFrom = effectiveFrom;
        s.createdBy = actor;
        s.change(weeklyOffs, hoursPerDay, actor);
        return s;
    }

    public void change(Set<DayOfWeek> weeklyOffs, BigDecimal hours, Long actor) {
        this.weeklyOffMask = (short) WorkCalendar.toMask(weeklyOffs);
        this.hoursPerDay = hours;
        this.updatedBy = actor;
    }

    public WorkCalendar.Schedule toSchedule() {
        return new WorkCalendar.Schedule(effectiveFrom, WorkCalendar.fromMask(weeklyOffMask), hoursPerDay);
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

    public LocalDate getEffectiveFrom() {
        return effectiveFrom;
    }

    public Set<DayOfWeek> getWeeklyOffs() {
        return WorkCalendar.fromMask(weeklyOffMask);
    }

    public BigDecimal getHoursPerDay() {
        return hoursPerDay;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
