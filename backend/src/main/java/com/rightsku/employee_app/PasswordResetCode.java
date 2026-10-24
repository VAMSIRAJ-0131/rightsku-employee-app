package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One emailed password reset code (table password_reset_codes, V12). Only a
 * BCrypt hash of the code is stored. A code is usable while it is unused,
 * not expired and has had fewer than {@link #MAX_ATTEMPTS} wrong tries.
 */
@Entity
@Table(name = "password_reset_codes")
public class PasswordResetCode {

    static final int MAX_ATTEMPTS = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "code_hash", nullable = false, length = 100)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PasswordResetCode() {
    }

    public static PasswordResetCode issue(long userId, String codeHash, Instant now, Instant expiresAt) {
        PasswordResetCode c = new PasswordResetCode();
        c.userId = userId;
        c.codeHash = codeHash;
        c.createdAt = now;
        c.expiresAt = expiresAt;
        return c;
    }

    public boolean usableAt(Instant now) {
        return usedAt == null && now.isBefore(expiresAt) && failedAttempts < MAX_ATTEMPTS;
    }

    public void recordFailedAttempt() {
        failedAttempts++;
    }

    /** Used for a reset, or ended because a newer code was issued. */
    public void end(Instant now) {
        if (usedAt == null) {
            usedAt = now;
        }
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getUsedAt() {
        return usedAt;
    }

    public int getFailedAttempts() {
        return failedAttempts;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
