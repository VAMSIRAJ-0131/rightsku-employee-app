package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "app_users")
public class AppUser {

    /** Role values allowed by the app_users.role check constraint. */
    public static final String ROLE_EMPLOYEE = "EMPLOYEE";
    public static final String ROLE_HR_ADMIN = "HR_ADMIN";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false, length = 20)
    private String role;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AppUser() {
    }

    /**
     * Creates a new active user. The password must already be hashed
     * (BCrypt); plain-text passwords are never stored.
     */
    public static AppUser create(String email, String passwordHash, String role) {
        if (!ROLE_EMPLOYEE.equals(role) && !ROLE_HR_ADMIN.equals(role)) {
            throw new IllegalArgumentException("Unsupported role");
        }
        AppUser user = new AppUser();
        user.email = email;
        user.passwordHash = passwordHash;
        user.role = role;
        user.active = true;
        return user;
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

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getRole() {
        return role;
    }

    public boolean isActive() {
        return active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
