package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One phone that stays signed in (table refresh_tokens, V16). Only a SHA-256
 * hash of the token is stored. Usable while not revoked, not expired, and
 * issued under the account's current session version.
 */
@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false, length = 64, unique = true)
    private String tokenHash;

    @Column(name = "session_version", nullable = false)
    private int sessionVersion;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected RefreshToken() {
    }

    public static RefreshToken issue(long userId, String tokenHash, int sessionVersion, Instant now, Instant expiresAt) {
        RefreshToken t = new RefreshToken();
        t.userId = userId;
        t.tokenHash = tokenHash;
        t.sessionVersion = sessionVersion;
        t.createdAt = now;
        t.lastUsedAt = now;
        t.expiresAt = expiresAt;
        return t;
    }

    /** Not logged out and not expired (the account itself is checked separately). */
    public boolean usableAt(Instant now) {
        return revokedAt == null && now.isBefore(expiresAt);
    }

    /** Used again: stays valid for another full period from now. */
    public void use(Instant now, Instant newExpiresAt) {
        this.lastUsedAt = now;
        this.expiresAt = newExpiresAt;
    }

    public void revoke(Instant now) {
        if (revokedAt == null) {
            this.revokedAt = now;
        }
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public int getSessionVersion() {
        return sessionVersion;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}
