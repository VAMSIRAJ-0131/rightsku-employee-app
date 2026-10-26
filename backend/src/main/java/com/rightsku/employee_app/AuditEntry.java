package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One row of the admin audit log (table audit_history, created in V1).
 * "details" is optional JSON, for example the previous and new value of a
 * leave balance. It never holds passwords or other secrets.
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

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String details;

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

    /** The same, with a small JSON object of details (built by the caller from safe values only). */
    public static AuditEntry of(Long actorUserId, String action, String entityType, String entityId, String detailsJson) {
        AuditEntry entry = of(actorUserId, action, entityType, entityId);
        entry.details = detailsJson;
        return entry;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Instant getCreatedAt() {
        return createdAt;
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

    public String getDetails() {
        return details;
    }
}
