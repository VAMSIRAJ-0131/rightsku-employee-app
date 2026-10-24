package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * HR-controlled working schedules (weekly offs and hours per day).
 *
 * <ul>
 *   <li>A schedule starts on a Monday and lasts until the next one, so a week
 *       never mixes two schedules. Earlier schedules are kept: a change never
 *       rewrites the days before its start.</li>
 *   <li>The start can be a past Monday, back to the week the employee joined
 *       (this week when there is no joining date), but only when nothing from
 *       that Monday on has been submitted or decided under the old schedule:
 *       no submitted timesheet week or day, no pending or approved leave whose
 *       working days would change, and no pending or approved Comp-Off request
 *       whose day would become a working day. Otherwise HR gets a clear
 *       message and nothing is saved.</li>
 *   <li>Exactly two weekly off days, any two of the seven (they need not be
 *       next to each other), so a normal week has five working days.</li>
 *   <li>Saving from a Monday applies from that Monday on: schedules that
 *       start later are replaced (kept for history, no longer applied).
 *       Saving again for the same start date replaces that schedule.</li>
 *   <li>The employee is notified when their schedule is created or changed.</li>
 *   <li>At least one working day per week; hours per day from 0.25 to 24 in
 *       steps of 0.25.</li>
 * </ul>
 */
@Service
public class ScheduleService {

    private static final BigDecimal QUARTER = new BigDecimal("0.25");
    private static final BigDecimal MAX_HOURS = BigDecimal.valueOf(24);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final WorkScheduleRepository schedules;
    private final EmployeeRepository employees;
    private final WorkCalendarService calendarService;
    private final TimesheetWeekRepository weeks;
    private final TimesheetEntryRepository entries;
    private final LeaveRequestRepository leaveRequests;
    private final CompOffRequestRepository compOffRequests;
    private final NotificationService notifications;
    private final AuditEntryRepository audit;
    private final Clock clock;

    public ScheduleService(
            WorkScheduleRepository schedules,
            EmployeeRepository employees,
            WorkCalendarService calendarService,
            TimesheetWeekRepository weeks,
            TimesheetEntryRepository entries,
            LeaveRequestRepository leaveRequests,
            CompOffRequestRepository compOffRequests,
            NotificationService notifications,
            AuditEntryRepository audit,
            Clock clock) {
        this.schedules = schedules;
        this.employees = employees;
        this.calendarService = calendarService;
        this.weeks = weeks;
        this.entries = entries;
        this.leaveRequests = leaveRequests;
        this.compOffRequests = compOffRequests;
        this.notifications = notifications;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ScheduleResponse get(long employeeId) {
        requireEmployee(employeeId);
        return response(employeeId);
    }

    @Transactional
    public ScheduleResponse set(long employeeId, ScheduleRequest request, Long actorUserId) {
        Employee employee = requireEmployee(employeeId);
        Set<DayOfWeek> offs = parseWeeklyOffs(request.weeklyOffs());
        BigDecimal hours = checkHours(request.hoursPerDay());
        LocalDate start = checkStart(employee, request.effectiveFrom());

        // One schedule or leave action per employee at a time (the lock every leave action uses).
        employees.lockById(employeeId);
        WorkCalendar.Schedule next = new WorkCalendar.Schedule(start, offs, hours);
        checkNothingDecidedChanges(employee, next);

        WorkSchedule schedule = schedules.findByEmployeeIdAndEffectiveFrom(employeeId, start).orElse(null);
        // Schedules in force that start after this Monday are replaced by this save.
        List<WorkSchedule> later = schedules.findByEmployeeIdOrderByEffectiveFromAsc(employeeId).stream()
                .filter(s -> s.getEffectiveFrom().isAfter(start))
                .toList();
        boolean changed = schedule == null || schedule.isReplaced() || !later.isEmpty()
                || !schedule.getWeeklyOffs().equals(offs) || schedule.getHoursPerDay().compareTo(hours) != 0;
        java.time.Instant now = clock.instant();
        for (WorkSchedule s : later) {
            s.replace(actorUserId, now);
            schedules.saveAndFlush(s);
        }
        if (schedule == null) {
            schedule = WorkSchedule.create(employeeId, start, offs, hours, actorUserId);
        } else {
            schedule.change(offs, hours, actorUserId);
        }
        try {
            schedules.saveAndFlush(schedule);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict("effectiveFrom", "This schedule was just changed by someone else. Try again.");
        }
        audit.save(AuditEntry.of(actorUserId, "SCHEDULE_CHANGED", "EMPLOYEE", employee.getEmployeeCode(),
                "{\"effectiveFrom\":\"" + start + "\",\"weeklyOffMask\":" + WorkCalendar.toMask(offs)
                        + ",\"hoursPerDay\":" + hours.toPlainString() + ",\"replacedLater\":" + later.size() + "}"));
        if (changed) {
            notifications.scheduleChanged(employee, next);
        }
        return response(employeeId);
    }

    /** The start must be a Monday, from the joining week (this week without a joining date) on. */
    private LocalDate checkStart(Employee employee, LocalDate start) {
        if (start.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw ApiException.invalid("effectiveFrom", "A schedule starts on a Monday. Choose Monday "
                    + DAY.format(start.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))) + " or a later Monday.");
        }
        LocalDate thisMonday = LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate joining = employee.getJoiningDate();
        LocalDate earliest = joining == null || joining.isAfter(thisMonday)
                ? thisMonday : joining.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        if (start.isBefore(earliest)) {
            throw ApiException.invalid("effectiveFrom", joining == null
                    ? "Without a joining date, a schedule can start from this week (Monday " + DAY.format(earliest) + ") or later."
                    : "A schedule can start from the week this employee joined (Monday " + DAY.format(earliest) + ") or later.");
        }
        return start;
    }

    /**
     * Refuses a change that would rewrite something already submitted or
     * decided under the current schedule, from its start date on.
     */
    private void checkNothingDecidedChanges(Employee employee, WorkCalendar.Schedule next) {
        long id = employee.getId();
        LocalDate start = next.effectiveFrom();
        String later = " Choose a later Monday, or keep the current schedule.";

        weeks.findFirstByEmployeeIdAndStatusAndWeekStartGreaterThanEqualOrderByWeekStartAsc(
                id, TimesheetWeek.STATUS_SUBMITTED, start).ifPresent(w -> {
            throw ApiException.conflict("effectiveFrom", "The timesheet for the week of " + DAY.format(w.getWeekStart())
                    + " is already submitted, so the schedule can't change from " + DAY.format(start) + "." + later);
        });
        entries.findFirstByEmployeeIdAndWorkDateGreaterThanEqualOrderByWorkDateAsc(id, start).ifPresent(e -> {
            throw ApiException.conflict("effectiveFrom", "Timesheet hours for " + DAY.format(e.getWorkDate())
                    + " are already submitted, so the schedule can't change from " + DAY.format(start) + "." + later);
        });

        List<LeaveRequest> leave = leaveRequests.activeEndingOnOrAfter(id, start);
        List<CompOffRequest> compOff = compOffRequests.activeFrom(id, start);
        if (leave.isEmpty() && compOff.isEmpty()) {
            return;
        }
        LocalDate last = start;
        for (LeaveRequest r : leave) {
            last = r.getEndDate().isAfter(last) ? r.getEndDate() : last;
        }
        for (CompOffRequest r : compOff) {
            last = r.getWorkDate().isAfter(last) ? r.getWorkDate() : last;
        }
        WorkCalendar before = calendarService.calendarFor(id, start, last);
        WorkCalendar after = before.withScheduleFrom(next);
        for (LeaveRequest r : leave) {
            LocalDate from = r.getStartDate().isBefore(start) ? start : r.getStartDate();
            for (LocalDate d = from; !d.isAfter(r.getEndDate()); d = d.plusDays(1)) {
                if (before.day(d).working() != after.day(d).working()) {
                    throw ApiException.conflict("effectiveFrom", LeaveType.valueOf(r.getLeaveType()).label()
                            + " leave from " + DAY.format(r.getStartDate()) + " to " + DAY.format(r.getEndDate())
                            + " is " + r.getStatus().toLowerCase(Locale.ROOT)
                            + ", and this schedule would change its working days." + later);
                }
            }
        }
        for (CompOffRequest r : compOff) {
            if (after.day(r.getWorkDate()).working()) {
                throw ApiException.conflict("effectiveFrom", "A " + r.getStatus().toLowerCase(Locale.ROOT)
                        + " Comp-Off request is for " + DAY.format(r.getWorkDate())
                        + ", which would become a working day." + later);
            }
        }
    }

    private ScheduleResponse response(long employeeId) {
        LocalDate today = LocalDate.now(clock);
        List<WorkCalendar.Schedule> saved = schedules.findByEmployeeIdOrderByEffectiveFromAsc(employeeId).stream()
                .map(WorkSchedule::toSchedule)
                .toList();
        WorkCalendar calendar = new WorkCalendar(calendarService.defaultSchedule(), saved, java.util.Map.of());
        List<ScheduleResponse.View> upcoming = saved.stream()
                .filter(s -> s.effectiveFrom().isAfter(today))
                .map(ScheduleResponse.View::from)
                .toList();
        List<ScheduleResponse.View> newestFirst = saved.stream()
                .sorted(Comparator.comparing(WorkCalendar.Schedule::effectiveFrom).reversed())
                .map(ScheduleResponse.View::from)
                .toList();
        return new ScheduleResponse(
                employeeId,
                ScheduleResponse.View.from(calendar.scheduleOn(today)),
                upcoming,
                newestFirst,
                ScheduleResponse.View.from(calendarService.defaultSchedule()));
    }

    private Employee requireEmployee(long employeeId) {
        return employees.findById(employeeId)
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
    }

    static Set<DayOfWeek> parseWeeklyOffs(List<String> names) {
        Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
        for (String name : names) {
            if (name == null || name.isBlank()) {
                throw ApiException.invalid("weeklyOffs", "Choose valid days.");
            }
            try {
                days.add(DayOfWeek.valueOf(name.trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException ex) {
                throw ApiException.invalid("weeklyOffs", "Choose valid days.");
            }
        }
        if (days.size() != 2) {
            throw ApiException.invalid("weeklyOffs", "Choose exactly two weekly off days.");
        }
        return days;
    }

    static BigDecimal checkHours(BigDecimal hours) {
        if (hours == null || hours.signum() <= 0 || hours.compareTo(MAX_HOURS) > 0
                || hours.remainder(QUARTER).signum() != 0) {
            throw ApiException.invalid("hoursPerDay", "Enter hours from 0.25 to 24, in steps of 0.25 (15 minutes).");
        }
        return hours.setScale(2, java.math.RoundingMode.UNNECESSARY);
    }
}
