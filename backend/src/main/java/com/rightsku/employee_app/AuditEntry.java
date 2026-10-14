package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One row of the admin audit log (table audit_history, created in V1).
 * The optional JSON "details" column is not used yet, so it is not mapped.
 */
@Entity
@Table(name = "audit_history")
public class AuditEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Column(nullable = false, length = 100)
    private String action;

    @Column(name = "entity_type", nullable = false, length = 100)
    private String entityType;

    @Column(name = "entity_id", length = 100)
    private String entityId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AuditEntry() {
    }

    public static AuditEntry of(Long actorUserId, String action, String entityType, String entityId) {
        AuditEntry entry = new AuditEntry();
        entry.actorUserId = actorUserId;
        entry.action = action;
        entry.entityType = entityType;
        entry.entityId = entityId;
        return entry;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }

    public Long getActorUserId() {
        return actorUserId;
    }

    public String getAction() {
        return action;
    }

    public String getEntityType() {
        return entityType;
    }

    public String getEntityId() {
        return entityId;
    }
}
