package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * The push (Firebase Cloud Messaging) token of one phone, for the account
 * signed in there (table push_tokens, V17).
 */
@Entity
@Table(name = "push_tokens")
public class PushToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 4096, unique = true)
    private String token;

    @Column(nullable = false, length = 20)
    private String platform;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    protected PushToken() {
    }

    public static PushToken register(long userId, String token, String platform, Instant now) {
        PushToken t = new PushToken();
        t.userId = userId;
        t.token = token;
        t.platform = platform;
        t.createdAt = now;
        t.lastSeenAt = now;
        return t;
    }

    /** Seen again, possibly for another account signed in on the same phone. */
    public void seen(long userId, Instant now) {
        this.userId = userId;
        this.lastSeenAt = now;
    }

    public Long getUserId() {
        return userId;
    }

    public String getToken() {
        return token;
    }
}
