package com.rightsku.employee_app;

import java.time.Instant;
import java.util.List;

/** One notification as returned by the API. */
public record NotificationResponse(Long id, String type, String title, String message, boolean read, Instant createdAt) {

    static NotificationResponse from(Notification n) {
        return new NotificationResponse(n.getId(), n.getType(), n.getTitle(), n.getMessage(), n.getReadAt() != null,
                n.getCreatedAt());
    }

    /** The list screen and the bell: newest notifications plus the unread count. */
    public record Page(long unreadCount, List<NotificationResponse> items) {
    }
}
