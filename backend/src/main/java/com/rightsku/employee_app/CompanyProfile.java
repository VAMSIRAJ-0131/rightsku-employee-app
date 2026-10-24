package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/** The company's name and phone (table company_profile, V15): one row, id 1, entered by HR. */
@Entity
@Table(name = "company_profile")
public class CompanyProfile {

    static final short ID = 1;

    @Id
    private Short id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(length = 30)
    private String phone;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CompanyProfile() {
    }

    static CompanyProfile create() {
        CompanyProfile p = new CompanyProfile();
        p.id = ID;
        return p;
    }

    void change(String name, String phone, Long actor, Instant at) {
        this.name = name;
        this.phone = phone;
        this.updatedBy = actor;
        this.updatedAt = at;
    }

    public String getName() {
        return name;
    }

    public String getPhone() {
        return phone;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
