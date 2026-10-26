package com.rightsku.employee_app;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Daily reminder (10:00, company time zone) about leave and Comp-Off requests
 * that have waited for HR for 2 days or more: each employee hears that theirs
 * is still waiting, and every active HR Admin gets one summary to review them.
 * It repeats every day until HR approves or rejects.
 *
 * The time can be changed with app.requests.pending-reminder-cron ("-" switches it off).
 */
@Component
public class PendingRequestReminderJob {

    /** How long a request waits before the first reminder. */
    static final Duration WAIT = Duration.ofDays(2);
    private static final Logger log = LoggerFactory.getLogger(PendingRequestReminderJob.class);

    private final LeaveRequestRepository leaves;
    private final CompOffRequestRepository compOffs;
    private final EmployeeRepository employees;
    private final AppUserRepository users;
    private final NotificationService notifications;
    private final Clock clock;

    public PendingRequestReminderJob(LeaveRequestRepository leaves, CompOffRequestRepository compOffs,
            EmployeeRepository employees, AppUserRepository users, NotificationService notifications, Clock clock) {
        this.leaves = leaves;
        this.compOffs = compOffs;
        this.employees = employees;
        this.users = users;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Scheduled(cron = "${app.requests.pending-reminder-cron:0 0 10 * * *}", zone = "${app.time-zone:Asia/Kolkata}")
    public void remind() {
        int[] sent = remindAt(clock.instant());
        log.info("Pending request reminders: {} leave, {} Comp-Off.", sent[0], sent[1]);
    }

    /** Sends the reminders due at this moment; returns {leave, Comp-Off} requests reminded about. */
    int[] remindAt(Instant now) {
        Instant cutoff = now.minus(WAIT);
        List<LeaveRequest> oldLeaves = leaves.findByStatusOrderByCreatedAtAsc(LeaveRequest.STATUS_PENDING).stream()
                .filter(r -> r.getCreatedAt() != null && !r.getCreatedAt().isAfter(cutoff)).toList();
        List<CompOffRequest> oldCompOffs = compOffs.findByStatusOrderByCreatedAtAsc(LeaveRequest.STATUS_PENDING).stream()
                .filter(r -> r.getCreatedAt() != null && !r.getCreatedAt().isAfter(cutoff)).toList();

        for (LeaveRequest r : oldLeaves) {
            employees.findById(r.getEmployeeId()).filter(Employee::isActive)
                    .ifPresent(e -> notifications.leavePendingReminder(e, r));
        }
        for (CompOffRequest r : oldCompOffs) {
            employees.findById(r.getEmployeeId()).filter(Employee::isActive)
                    .ifPresent(e -> notifications.compOffPendingReminder(e, r));
        }
        if (!oldLeaves.isEmpty() || !oldCompOffs.isEmpty()) {
            for (AppUser hr : users.findByRoleAndActiveTrue(AppUser.ROLE_HR_ADMIN)) {
                notifications.pendingApprovalsReminder(hr.getId(), oldLeaves.size(), oldCompOffs.size());
            }
        }
        return new int[] {oldLeaves.size(), oldCompOffs.size()};
    }
}
