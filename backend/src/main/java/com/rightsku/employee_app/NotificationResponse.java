package com.rightsku.employee_app;

import java.time.Instant;
import java.util.List;

/**
 * One notification as returned by the API. linkType and linkKey say which of
 * the person's own records it is about (null for older notifications).
 */
public record NotificationResponse(Long id, String type, String title, String message, boolean read, Instant createdAt,
                                   String linkType, String linkKey) {

    static NotificationResponse from(Notification n) {
        return new NotificationResponse(n.getId(), n.getType(), n.getTitle(), n.getMessage(), n.getReadAt() != null,
                n.getCreatedAt(), n.getLinkType(), n.getLinkKey());
    }

    /** The list screen and the bell: newest notifications plus the unread count. */
    public record Page(long unreadCount, List<NotificationResponse> items) {
    }
}
