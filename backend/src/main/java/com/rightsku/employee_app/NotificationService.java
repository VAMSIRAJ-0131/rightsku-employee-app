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
 *   <li>Read, marked read and cleared only by their owner: every lookup
 *       includes the signed-in account's ID from the token. Clearing hides
 *       the notification only; the record it is about is never touched.</li>
 *   <li>Each one is linked to the record it is about (link type and key),
 *       so the app can open it.</li>
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
                        + withNote(request.getReviewNote()),
                "LEAVE_REQUEST", request.getId());
    }

    void timesheetReviewed(Employee employee, LocalDate weekStart, boolean approved, String note) {
        send(employee,
                approved ? Notification.TIMESHEET_APPROVED : Notification.TIMESHEET_REJECTED,
                "Timesheet " + (approved ? "approved" : "rejected"),
                "Your timesheet for the week of " + DAY.format(weekStart) + (approved ? " was approved." : " was rejected.")
                        + withNote(note),
                "TIMESHEET_WEEK", weekStart);
    }

    void documentPublished(EmployeeDocument document, boolean replaced) {
        boolean payslip = document.getType() == DocumentType.PAYSLIP;
        String title = payslip
                ? (replaced ? "Payslip updated" : "Payslip published")
                : (replaced ? "Document updated" : "New document");
        send(document.getEmployee(),
                payslip ? Notification.PAYSLIP_PUBLISHED : Notification.DOCUMENT_PUBLISHED,
                title,
                document.getTitle() + (replaced ? " was updated by HR." : " is ready to download."),
                "DOCUMENT", document.getId());
    }

    /** HR saved a working schedule (weekly offs and hours per day) starting on this Monday. */
    void scheduleChanged(Employee employee, WorkCalendar.Schedule schedule) {
        send(employee, Notification.SCHEDULE_CHANGED, "Weekly off schedule changed",
                "From Monday " + DAY.format(schedule.effectiveFrom()) + ": " + weeklyOffsText(schedule.weeklyOffs())
                        + ", " + TimesheetService.plain(schedule.hoursPerDay()) + " hours a working day.",
                "SCHEDULE", schedule.effectiveFrom());
    }

    void compOffDecided(Employee employee, CompOffRequest request, boolean approved) {
        String days = request.getDays().compareTo(java.math.BigDecimal.ONE) == 0 ? "1 day" : "half a day";
        send(employee,
                approved ? Notification.COMP_OFF_APPROVED : Notification.COMP_OFF_REJECTED,
                "Comp-Off " + (approved ? "approved" : "rejected"),
                "Your Comp-Off request for " + DAY.format(request.getWorkDate())
                        + (approved ? " was approved: " + days + " added to your Comp-Off balance." : " was rejected.")
                        + withNote(request.getReviewNote()),
                "COMP_OFF_REQUEST", request.getId());
    }

    /** "Tuesday and Wednesday off", "Sunday off", "no weekly off". */
    static String weeklyOffsText(java.util.Set<java.time.DayOfWeek> offs) {
        if (offs.isEmpty()) {
            return "no weekly off";
        }
        java.util.List<String> names = offs.stream().sorted()
                .map(d -> d.getDisplayName(java.time.format.TextStyle.FULL, Locale.ENGLISH)).toList();
        String joined = names.size() == 1 ? names.get(0)
                : String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
        return joined + " off";
    }

    private void send(Employee employee, String type, String title, String message, String linkType, Object linkKey) {
        if (employee == null || employee.getUser() == null || employee.getUser().getId() == null) {
            return;
        }
        notifications.save(Notification.of(employee.getUser().getId(), type, title, message, clock.instant())
                .linkTo(linkType, linkKey));
    }

    private static String withNote(String note) {
        return note == null || note.isBlank() ? "" : " HR note: " + note.trim();
    }

    /* ---------- The signed-in account's own notifications ---------- */

    @Transactional(readOnly = true)
    public NotificationResponse.Page mine(long userId) {
        return new NotificationResponse.Page(
                notifications.countByUserIdAndReadAtIsNullAndClearedAtIsNull(userId),
                notifications.findTop50ByUserIdAndClearedAtIsNullOrderByCreatedAtDescIdDesc(userId).stream()
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

    /** Clears one of the account's own notifications from its list. Someone else's ID answers 404. */
    @Transactional
    public NotificationResponse.Page clear(long userId, long notificationId) {
        Notification n = notifications.findByIdAndUserId(notificationId, userId)
                .orElseThrow(() -> ApiException.notFound("Notification not found."));
        n.clear(clock.instant());
        n.markRead(clock.instant());
        notifications.save(n);
        return mine(userId);
    }

    /** Clears all of the account's notifications. Leave, timesheets, documents etc. are not touched. */
    @Transactional
    public NotificationResponse.Page clearAll(long userId) {
        notifications.clearAll(userId, clock.instant());
        return mine(userId);
    }
}
