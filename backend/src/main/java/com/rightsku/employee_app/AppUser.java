package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.Locale;
import java.util.regex.Pattern;

@Entity
@Table(name = "app_users")
public class AppUser {

    /** Role values allowed by the app_users.role check constraint. */
    public static final String ROLE_EMPLOYEE = "EMPLOYEE";
    public static final String ROLE_HR_ADMIN = "HR_ADMIN";

    /**
     * Employee ID format (same rule as the database check and the login form):
     * starts with a letter or digit; then letters, digits, ".", "_" or "-";
     * at most 30 characters. Never contains "@".
     */
    private static final Pattern LOGIN_ID_FORMAT = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    /** Employee ID used to sign in (e.g. EMP001). Null for HR Admins, who sign in by email. */
    @Column(name = "login_id", length = 30)
    private String loginId;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false, length = 20)
    private String role;

    @Column(nullable = false)
    private boolean active = true;

    /** True while the account still uses a temporary password set by HR (V4). */
    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    /** Increases on every password change; tokens with an older value stop working (V4). */
    @Column(name = "session_version", nullable = false)
    private int sessionVersion;

    @Column(name = "password_changed_at")
    private Instant passwordChangedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AppUser() {
    }

    /**
     * Creates a new active user without an Employee ID (HR Admins).
     * The password must already be hashed (BCrypt).
     */
    public static AppUser create(String email, String passwordHash, String role) {
        return create(null, email, passwordHash, role);
    }

    /**
     * Creates a new active user. Employees must have an Employee ID (loginId).
     * The password must already be hashed (BCrypt); plain-text passwords are
     * never stored.
     */
    public static AppUser create(String loginId, String email, String passwordHash, String role) {
        if (!ROLE_EMPLOYEE.equals(role) && !ROLE_HR_ADMIN.equals(role)) {
            throw new IllegalArgumentException("Unsupported role");
        }
        String id = normalizeLoginId(loginId);
        if (ROLE_EMPLOYEE.equals(role) && id == null) {
            throw new IllegalArgumentException("Employees need an Employee ID");
        }
        AppUser user = new AppUser();
        user.loginId = id;
        user.email = email;
        user.passwordHash = passwordHash;
        user.role = role;
        user.active = true;
        return user;
    }

    /**
     * Validates an Employee ID and returns it in its stored form: trimmed and
     * upper case (EMP001). Returns null for a missing or blank ID.
     * EmployeeService uses this when assigning IDs and stores the same value
     * in employees.employee_code (see docs/authentication.md).
     */
    public static String normalizeLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            return null;
        }
        String id = loginId.trim();
        if (!LOGIN_ID_FORMAT.matcher(id).matches()) {
            throw new IllegalArgumentException(
                    "Employee ID must be 1-30 letters, digits, '.', '_' or '-' and start with a letter or digit");
        }
        return id.toUpperCase(Locale.ROOT);
    }

    /**
     * Marks the password as temporary: the account holder must choose a new
     * one at the next sign-in before using the app.
     */
    public void requirePasswordChange() {
        this.mustChangePassword = true;
    }

    /**
     * Stores a new password chosen by the account holder. The caller has
     * already checked the current password and the password rules; the value
     * must already be hashed (BCrypt). All existing sessions end, because
     * their tokens carry the previous session version.
     */
    public void changePassword(String newPasswordHash, Instant changedAt) {
        this.passwordHash = newPasswordHash;
        this.mustChangePassword = false;
        this.sessionVersion++;
        this.passwordChangedAt = changedAt;
    }

    /** Changes the login email. The caller checks the format and that it is not already used. */
    public void changeEmail(String newEmail) {
        this.email = newEmail;
    }

    /** Allows sign-in again. */
    public void activate() {
        this.active = true;
    }

    /** Blocks sign-in; existing tokens stop working at their next request. */
    public void deactivate() {
        this.active = false;
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

    public String getLoginId() {
        return loginId;
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

    public boolean isMustChangePassword() {
        return mustChangePassword;
    }

    public int getSessionVersion() {
        return sessionVersion;
    }

    public Instant getPasswordChangedAt() {
        return passwordChangedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
