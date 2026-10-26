package com.rightsku.employee_app;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
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
 *   <li>Each one is also pushed to the account's phones once it is saved
 *       (PushNotifier), so it arrives even when the app is closed.</li>
 * </ul>
 */
@Service
public class NotificationService {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final NotificationRepository notifications;
    private final Clock clock;
    private final ApplicationEventPublisher events;
    /** To find the HR Admins for notifications meant for HR (null in unit tests: none are sent). */
    private final AppUserRepository users;

    @Autowired
    public NotificationService(NotificationRepository notifications, Clock clock, ApplicationEventPublisher events,
            AppUserRepository users) {
        this.notifications = notifications;
        this.clock = clock;
        this.events = events;
        this.users = users;
    }

    public NotificationService(NotificationRepository notifications, Clock clock, ApplicationEventPublisher events) {
        this(notifications, clock, events, null);
    }

    /** Without pushes (unit tests). */
    public NotificationService(NotificationRepository notifications, Clock clock) {
        this(notifications, clock, event -> { });
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
        String title = switch (document.getType()) {
            case PAYSLIP -> replaced ? "Payslip updated" : "Payslip published";
            case FORM_16 -> replaced ? "Form 16 updated" : "Form 16 published";
            case COMPENSATION_LETTER -> replaced ? "Appraisal letter updated" : "Appraisal letter published";
            default -> replaced ? "Document updated" : "New document";
        };
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

    /** HR set one leave type's balance. */
    void leaveBalanceUpdated(Employee employee, String leaveLabel, java.math.BigDecimal days) {
        send(employee, Notification.LEAVE_BALANCE_UPDATED, "Leave balance updated",
                "HR set your " + leaveLabel + " leave balance to " + TimesheetService.plain(days) + " " + dayWord(days) + ".",
                null, null);
    }

    /** HR added or deducted Comp-Off days. */
    void compOffBalanceUpdated(Employee employee, java.math.BigDecimal change, java.math.BigDecimal balance, String reason) {
        java.math.BigDecimal size = change.abs();
        send(employee, Notification.LEAVE_BALANCE_UPDATED, "Comp-Off balance updated",
                "HR " + (change.signum() >= 0 ? "added " : "deducted ") + TimesheetService.plain(size) + " " + dayWord(size)
                        + (change.signum() >= 0 ? " to" : " from") + " your Comp-Off balance. It is now "
                        + TimesheetService.plain(balance) + " " + dayWord(balance) + "." + withNote(reason),
                null, null);
    }

    /** HR added, changed or removed a company holiday: every active employee hears about it. */
    void holidaysUpdated(Iterable<Employee> everyone, String message) {
        for (Employee employee : everyone) {
            if (employee.isActive()) {
                send(employee, Notification.HOLIDAYS_UPDATED, "Holiday calendar updated", message, null, null);
            }
        }
    }

    /** The employee's leave has waited 2 days or more for HR. */
    void leavePendingReminder(Employee employee, LeaveRequest request) {
        String type = LeaveType.valueOf(request.getLeaveType()).label();
        send(employee, Notification.LEAVE_PENDING_REMINDER, "Leave still waiting for HR",
                "Your " + type + " leave from " + DAY.format(request.getStartDate()) + " is still waiting for HR’s approval.",
                "LEAVE_REQUEST", request.getId());
    }

    /** The employee's Comp-Off request has waited 2 days or more for HR. */
    void compOffPendingReminder(Employee employee, CompOffRequest request) {
        send(employee, Notification.COMP_OFF_PENDING_REMINDER, "Comp-Off still waiting for HR",
                "Your Comp-Off request for " + DAY.format(request.getWorkDate()) + " is still waiting for HR’s approval.",
                "COMP_OFF_REQUEST", request.getId());
    }

    /** An HR Admin: requests that have waited 2 days or more. */
    void pendingApprovalsReminder(long hrUserId, int leaves, int compOffs) {
        String what = (leaves > 0 ? leaves + " leave " + (leaves == 1 ? "request" : "requests") : "")
                + (leaves > 0 && compOffs > 0 ? " and " : "")
                + (compOffs > 0 ? compOffs + " Comp-Off " + (compOffs == 1 ? "request" : "requests") : "");
        sendToUser(hrUserId, Notification.PENDING_APPROVALS_REMINDER, "Requests waiting for you",
                what + " waited 2 days or more. Please approve or reject them.", null, null);
    }

    /** (HR) An employee withdrew pending leave. */
    void leaveCancelled(Employee employee, LeaveRequest request) {
        String type = LeaveType.valueOf(request.getLeaveType()).label();
        String dates = DAY.format(request.getStartDate())
                + (request.getEndDate().equals(request.getStartDate()) ? "" : " to " + DAY.format(request.getEndDate()));
        toHrAdmins(Notification.LEAVE_CANCELLED, "Leave request cancelled",
                who(employee) + " cancelled their " + type + " leave request for " + dates + ".");
    }

    /** (HR) An employee withdrew a pending Comp-Off request. */
    void compOffCancelled(Employee employee, CompOffRequest request) {
        toHrAdmins(Notification.COMP_OFF_CANCELLED, "Comp-Off request cancelled",
                who(employee) + " cancelled their Comp-Off request for " + DAY.format(request.getWorkDate()) + ".");
    }

    /** (HR) An employee asked to change personal details. */
    void profileChangeRequested(Employee employee, java.util.List<String> fieldLabels) {
        toHrAdmins(Notification.PROFILE_CHANGE_REQUESTED, "Profile update request",
                who(employee) + " asked to update: " + String.join(", ", fieldLabels) + ".");
    }

    /** The employee's personal details change was approved (and saved) or rejected. */
    void profileChangeDecided(Employee employee, boolean approved, String note) {
        send(employee, approved ? Notification.PROFILE_CHANGE_APPROVED : Notification.PROFILE_CHANGE_REJECTED,
                "Profile update " + (approved ? "approved" : "rejected"),
                approved ? "HR approved your profile update. Your details are updated." + withNote(note)
                        : "HR rejected your profile update." + withNote(note),
                null, null);
    }

    private void toHrAdmins(String type, String title, String message) {
        if (users == null) {
            return;
        }
        for (AppUser hr : users.findByRoleAndActiveTrue(AppUser.ROLE_HR_ADMIN)) {
            sendToUser(hr.getId(), type, title, message, null, null);
        }
    }

    /** "Priya Shah (EMP004)". */
    private static String who(Employee e) {
        return (e.getFirstName() + " " + e.getLastName()).trim() + " (" + e.getEmployeeCode() + ")";
    }

    private static String dayWord(java.math.BigDecimal days) {
        return days.compareTo(java.math.BigDecimal.ONE) == 0 ? "day" : "days";
    }

    /** Mondays at 11:00 and 21:00: last week's timesheet still has to be submitted. */
    void timesheetReminder(Employee employee, LocalDate weekStart) {
        send(employee, Notification.TIMESHEET_REMINDER, "Submit your timesheet",
                "Your timesheet for the week of " + DAY.format(weekStart) + " is not submitted yet. "
                        + "Please submit it, and enter today's hours too.",
                "TIMESHEET_WEEK", weekStart);
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
        sendToUser(employee.getUser().getId(), type, title, message, linkType, linkKey);
    }

    private void sendToUser(long userId, String type, String title, String message, String linkType, Object linkKey) {
        notifications.save(Notification.of(userId, type, title, message, clock.instant()).linkTo(linkType, linkKey));
        events.publishEvent(new PushNotifier.Created(userId, type, title, message, linkType,
                linkKey == null ? null : String.valueOf(linkKey)));
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
