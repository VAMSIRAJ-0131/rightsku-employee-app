package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One office address of the company (table company_addresses, V15), entered
 * by HR. An employee's ID card shows the address HR picked for them. An
 * address is never deleted, only made inactive, so ID cards that use it keep
 * working.
 */
@Entity
@Table(name = "company_addresses")
public class CompanyAddress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 60)
    private String label;

    @Column(nullable = false, length = 300)
    private String address;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_by", updatable = false)
    private Long createdBy;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CompanyAddress() {
    }

    static CompanyAddress create(String label, String address, Long actor) {
        CompanyAddress a = new CompanyAddress();
        a.createdBy = actor;
        a.change(label, address, true, actor);
        return a;
    }

    void change(String label, String address, boolean active, Long actor) {
        this.label = label;
        this.address = address;
        this.active = active;
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

    public String getLabel() {
        return label;
    }

    public String getAddress() {
        return address;
    }

    public boolean isActive() {
        return active;
    }
}
