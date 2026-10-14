package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

/** A company-wide holiday (table company_holidays, V6). Managed by HR. */
@Entity
@Table(name = "company_holidays")
public class CompanyHoliday {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "holiday_date", nullable = false, unique = true)
    private LocalDate holidayDate;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CompanyHoliday() {
    }

    public static CompanyHoliday create(LocalDate date, String name, Long actor) {
        CompanyHoliday h = new CompanyHoliday();
        h.holidayDate = date;
        h.name = name;
        h.createdBy = actor;
        h.updatedBy = actor;
        return h;
    }

    public void change(LocalDate newDate, String newName, Long actor) {
        this.holidayDate = newDate;
        this.name = newName;
        this.updatedBy = actor;
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

    public LocalDate getDate() {
        return holidayDate;
    }

    public String getName() {
        return name;
    }
}
