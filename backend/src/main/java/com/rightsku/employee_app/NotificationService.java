package com.rightsku.employee_app;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * In-app notifications.
 *
 * <ul>
 *   <li>Written by the services where HR acts (leave and timesheet decisions,
 *       documents and payslips), inside the same transaction, so a
 *       notification exists exactly when the action was saved.</li>
 *   <li>Read and marked read only by their owner: every lookup includes the
 *       signed-in account's ID from the token.</li>
 *   <li>Messages hold only what the employee can already see in the app
 *       (dates, leave type, HR's note); never passwords or other secrets.</li>
 * </ul>
 */
@Service
public class NotificationService {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final NotificationRepository notifications;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, Clock clock) {
        this.notifications = notifications;
        this.clock = clock;
    }

    /* ---------- Written when HR acts ---------- */

    void leaveDecided(Employee employee, LeaveRequest request, boolean approved) {
        String type = LeaveType.valueOf(request.getLeaveType()).label();
        String dates = DAY.format(request.getStartDate())
                + (request.getEndDate().equals(request.getStartDate()) ? "" : " to " + DAY.format(request.getEndDate()));
        send(employee,
                approved ? Notification.LEAVE_APPROVED : Notification.LEAVE_REJECTED,
                type + " leave " + (approved ? "approved" : "rejected"),
                "Your " + type + " leave for " + dates + (approved ? " was approved." : " was rejected.")
                        + withNote(request.getReviewNote()));
    }

    void timesheetReviewed(Employee employee, LocalDate weekStart, boolean approved, String note) {
        send(employee,
                approved ? Notification.TIMESHEET_APPROVED : Notification.TIMESHEET_REJECTED,
                "Timesheet " + (approved ? "approved" : "rejected"),
                "Your timesheet for the week of " + DAY.format(weekStart) + (approved ? " was approved." : " was rejected.")
                        + withNote(note));
    }

    void documentPublished(EmployeeDocument document, boolean replaced) {
        boolean payslip = document.getType() == DocumentType.PAYSLIP;
        String title = payslip
                ? (replaced ? "Payslip updated" : "Payslip published")
                : (replaced ? "Document updated" : "New document");
        send(document.getEmployee(),
                payslip ? Notification.PAYSLIP_PUBLISHED : Notification.DOCUMENT_PUBLISHED,
                title,
                document.getTitle() + (replaced ? " was updated by HR." : " is ready to download."));
    }

    private void send(Employee employee, String type, String title, String message) {
        if (employee == null || employee.getUser() == null || employee.getUser().getId() == null) {
            return;
        }
        notifications.save(Notification.of(employee.getUser().getId(), type, title, message, clock.instant()));
    }

    private static String withNote(String note) {
        return note == null || note.isBlank() ? "" : " HR note: " + note.trim();
    }

    /* ---------- The signed-in account's own notifications ---------- */

    @Transactional(readOnly = true)
    public NotificationResponse.Page mine(long userId) {
        return new NotificationResponse.Page(
                notifications.countByUserIdAndReadAtIsNull(userId),
                notifications.findTop50ByUserIdOrderByCreatedAtDescIdDesc(userId).stream()
                        .map(NotificationResponse::from).toList());
    }

    /** Marks one of the account's own notifications read. Someone else's ID answers 404, like a missing one. */
    @Transactional
    public NotificationResponse markRead(long userId, long notificationId) {
        Notification n = notifications.findByIdAndUserId(notificationId, userId)
                .orElseThrow(() -> ApiException.notFound("Notification not found."));
        n.markRead(clock.instant());
        return NotificationResponse.from(notifications.save(n));
    }

    @Transactional
    public NotificationResponse.Page markAllRead(long userId) {
        notifications.markAllRead(userId, clock.instant());
        return mine(userId);
    }
}
