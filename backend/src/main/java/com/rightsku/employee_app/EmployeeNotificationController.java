package com.rightsku.employee_app;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in employee's notifications. /api/employee/** requires the
 * EMPLOYEE role; the account is always taken from the token, so nobody can
 * list or mark another employee's notifications.
 */
@RestController
@RequestMapping("/api/employee/notifications")
public class EmployeeNotificationController {

    private final NotificationService notifications;

    public EmployeeNotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public NotificationResponse.Page mine(@AuthenticationPrincipal Jwt jwt) {
        return notifications.mine(userId(jwt));
    }

    @PostMapping("/{id}/read")
    public NotificationResponse markRead(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return notifications.markRead(userId(jwt), id);
    }

    @PostMapping("/read-all")
    public NotificationResponse.Page markAllRead(@AuthenticationPrincipal Jwt jwt) {
        return notifications.markAllRead(userId(jwt));
    }

    /** Clears (hides) one notification. The leave, timesheet or document it is about is not changed. */
    @PostMapping("/{id}/clear")
    public NotificationResponse.Page clear(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return notifications.clear(userId(jwt), id);
    }

    /** Clears all of the employee's notifications. */
    @PostMapping("/clear-all")
    public NotificationResponse.Page clearAll(@AuthenticationPrincipal Jwt jwt) {
        return notifications.clearAll(userId(jwt));
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
