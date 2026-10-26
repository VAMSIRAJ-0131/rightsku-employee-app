package com.rightsku.employee_app;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Sends a push notification to phones. The real sender is Firebase Cloud
 * Messaging (FcmPushSender) when it is configured; otherwise nothing is sent
 * and the in-app notifications still work as before.
 */
public interface PushSender {

    /** Whether pushes can be sent at all (Firebase configured). */
    boolean enabled();

    /**
     * Sends one notification to each token. Returns the tokens Firebase says
     * no longer exist, so they can be removed.
     */
    Set<String> send(List<String> tokens, String title, String body, Map<String, String> data);

    /** Used when Firebase is not configured. */
    PushSender NONE = new PushSender() {
        @Override
        public boolean enabled() {
            return false;
        }

        @Override
        public Set<String> send(List<String> tokens, String title, String body, Map<String, String> data) {
            return Set.of();
        }
    };
}
