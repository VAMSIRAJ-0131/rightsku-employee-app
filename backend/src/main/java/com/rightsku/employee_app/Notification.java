package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One in-app notification for one account (table notifications, V10).
 * Created by the backend when HR acts; the app only marks it read.
 */
@Entity
@Table(name = "notifications")
public class Notification {

    public static final String LEAVE_APPROVED = "LEAVE_APPROVED";
    public static final String LEAVE_REJECTED = "LEAVE_REJECTED";
    public static final String TIMESHEET_APPROVED = "TIMESHEET_APPROVED";
    public static final String TIMESHEET_REJECTED = "TIMESHEET_REJECTED";
    public static final String PAYSLIP_PUBLISHED = "PAYSLIP_PUBLISHED";
    public static final String DOCUMENT_PUBLISHED = "DOCUMENT_PUBLISHED";
    public static final String SCHEDULE_CHANGED = "SCHEDULE_CHANGED";
    public static final String COMP_OFF_APPROVED = "COMP_OFF_APPROVED";
    public static final String COMP_OFF_REJECTED = "COMP_OFF_REJECTED";
    public static final String TIMESHEET_REMINDER = "TIMESHEET_REMINDER";
    public static final String LEAVE_BALANCE_UPDATED = "LEAVE_BALANCE_UPDATED";
    public static final String HOLIDAYS_UPDATED = "HOLIDAYS_UPDATED";
    public static final String LEAVE_PENDING_REMINDER = "LEAVE_PENDING_REMINDER";
    public static final String COMP_OFF_PENDING_REMINDER = "COMP_OFF_PENDING_REMINDER";
    public static final String PENDING_APPROVALS_REMINDER = "PENDING_APPROVALS_REMINDER";
    public static final String LEAVE_CANCELLED = "LEAVE_CANCELLED";
    public static final String COMP_OFF_CANCELLED = "COMP_OFF_CANCELLED";
    public static final String PROFILE_CHANGE_REQUESTED = "PROFILE_CHANGE_REQUESTED";
    public static final String PROFILE_CHANGE_APPROVED = "PROFILE_CHANGE_APPROVED";
    public static final String PROFILE_CHANGE_REJECTED = "PROFILE_CHANGE_REJECTED";

    static final int MAX_TITLE = 150;
    static final int MAX_MESSAGE = 500;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 30)
    private String type;

    @Column(nullable = false, length = MAX_TITLE)
    private String title;

    @Column(nullable = false, length = MAX_MESSAGE)
    private String message;

    @Column(name = "read_at")
    private Instant readAt;

    /** What the notification is about, so tapping it opens that record (V15). Null for older ones. */
    @Column(name = "link_type", length = 30)
    private String linkType;

    @Column(name = "link_key", length = 40)
    private String linkKey;

    /** When the person cleared it from their list. Only the notification is hidden; nothing else changes. */
    @Column(name = "cleared_at")
    private Instant clearedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Notification() {
    }

    public static Notification of(long userId, String type, String title, String message, Instant createdAt) {
        Notification n = new Notification();
        n.userId = userId;
        n.type = type;
        n.title = cut(title, MAX_TITLE);
        n.message = cut(message == null ? "" : message, MAX_MESSAGE);
        n.createdAt = createdAt;
        return n;
    }

    private static String cut(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }

    /** Points the notification at a record: LEAVE_REQUEST, TIMESHEET_WEEK, DOCUMENT, SCHEDULE or COMP_OFF_REQUEST. */
    public Notification linkTo(String type, Object key) {
        this.linkType = type;
        this.linkKey = key == null ? null : cut(String.valueOf(key), 40);
        return this;
    }

    /** Hides it from the list (and the unread count). */
    public void clear(Instant when) {
        if (clearedAt == null) {
            clearedAt = when;
        }
    }

    public String getLinkType() {
        return linkType;
    }

    public String getLinkKey() {
        return linkKey;
    }

    public Instant getClearedAt() {
        return clearedAt;
    }

    public void markRead(Instant when) {
        if (readAt == null) {
            readAt = when;
        }
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public String getMessage() {
        return message;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
