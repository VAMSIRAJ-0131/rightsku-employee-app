package com.rightsku.employee_app;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Weekly timesheet reminder: every Monday at 11:00 and 21:00 (company time
 * zone), each active employee whose timesheet for the week that just ended is
 * not submitted gets a notification, pushed to their phone. Employees who
 * already submitted, joined later, or had no working days that week get none.
 *
 * The time can be changed with app.timesheet.reminder-cron ("-" switches it off).
 */
@Component
public class TimesheetReminderJob {

    private static final Logger log = LoggerFactory.getLogger(TimesheetReminderJob.class);

    private final EmployeeRepository employees;
    private final TimesheetService timesheets;
    private final NotificationService notifications;
    private final Clock clock;

    public TimesheetReminderJob(EmployeeRepository employees, TimesheetService timesheets,
            NotificationService notifications, Clock clock) {
        this.employees = employees;
        this.timesheets = timesheets;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Scheduled(cron = "${app.timesheet.reminder-cron:0 0 11,21 * * MON}", zone = "${app.time-zone:Asia/Kolkata}")
    public void remind() {
        int sent = remindFor(LocalDate.now(clock));
        log.info("Timesheet reminders sent: {}.", sent);
    }

    /** Reminds about the week before the one containing this day; returns how many were reminded. */
    int remindFor(LocalDate today) {
        LocalDate lastWeek = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(1);
        int sent = 0;
        for (Employee employee : employees.findAll()) {
            AppUser user = employee.getUser();
            if (!employee.isActive() || user == null || !user.isActive() || user.getId() == null) {
                continue;
            }
            try {
                WeekTimesheetResponse week = timesheets.weekMine(user.getId(), lastWeek);
                boolean submitted = "SUBMITTED".equals(week.status()) || TimesheetService.ALREADY_SUBMITTED.equals(week.status());
                if (submitted || week.submitOpensOn() == null) {
                    continue;
                }
                notifications.timesheetReminder(employee, lastWeek);
                sent++;
            } catch (ApiException e) {
                // That week is before the joining date, or out of range: nothing to remind about.
            }
        }
        return sent;
    }
}
