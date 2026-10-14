package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
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
 *   <li>A schedule starts on its effective date and lasts until the next
 *       one. The start date must be today or later (company time zone), so
 *       a change never rewrites days that have already passed or the
 *       timesheets submitted for them.</li>
 *   <li>Saving again for the same start date replaces that schedule.</li>
 *   <li>At least one working day per week; hours per day from 0.25 to 24 in
 *       steps of 0.25.</li>
 * </ul>
 */
@Service
public class ScheduleService {

    private static final BigDecimal QUARTER = new BigDecimal("0.25");
    private static final BigDecimal MAX_HOURS = BigDecimal.valueOf(24);

    private final WorkScheduleRepository schedules;
    private final EmployeeRepository employees;
    private final WorkCalendarService calendarService;
    private final AuditEntryRepository audit;
    private final Clock clock;

    public ScheduleService(
            WorkScheduleRepository schedules,
            EmployeeRepository employees,
            WorkCalendarService calendarService,
            AuditEntryRepository audit,
            Clock clock) {
        this.schedules = schedules;
        this.employees = employees;
        this.calendarService = calendarService;
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
        if (request.effectiveFrom().isBefore(LocalDate.now(clock))) {
            throw ApiException.invalid("effectiveFrom",
                    "A new schedule can start today or later. Earlier dates keep the schedule they had.");
        }
        Set<DayOfWeek> offs = parseWeeklyOffs(request.weeklyOffs());
        BigDecimal hours = checkHours(request.hoursPerDay());

        WorkSchedule schedule = schedules.findByEmployeeIdAndEffectiveFrom(employeeId, request.effectiveFrom())
                .orElse(null);
        if (schedule == null) {
            schedule = WorkSchedule.create(employeeId, request.effectiveFrom(), offs, hours, actorUserId);
        } else {
            schedule.change(offs, hours, actorUserId);
        }
        try {
            schedules.saveAndFlush(schedule);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict("effectiveFrom", "This schedule was just changed by someone else. Try again.");
        }
        audit.save(AuditEntry.of(actorUserId, "SCHEDULE_CHANGED", "EMPLOYEE", employee.getEmployeeCode()));
        return response(employeeId);
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
        if (days.size() == 7) {
            throw ApiException.invalid("weeklyOffs", "Leave at least one working day in the week.");
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
