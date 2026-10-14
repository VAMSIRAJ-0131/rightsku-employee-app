package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds an employee's {@link WorkCalendar} from their HR-set schedules, the
 * company default schedule and the company holiday calendar.
 *
 * The company default (used until HR sets a schedule for an employee) comes
 * from app.schedule.default-weekly-offs and app.schedule.default-hours-per-day.
 */
@Service
public class WorkCalendarService {

    /** Longest date range one request may ask for (about three months). */
    static final int MAX_RANGE_DAYS = 93;

    private final WorkScheduleRepository schedules;
    private final CompanyHolidayRepository holidays;
    private final WorkCalendar.Schedule defaultSchedule;

    public WorkCalendarService(
            WorkScheduleRepository schedules,
            CompanyHolidayRepository holidays,
            @Value("${app.schedule.default-weekly-offs:SATURDAY,SUNDAY}") String defaultWeeklyOffs,
            @Value("${app.schedule.default-hours-per-day:8}") BigDecimal defaultHoursPerDay) {
        this.schedules = schedules;
        this.holidays = holidays;
        Set<DayOfWeek> offs = parseDays(defaultWeeklyOffs);
        if (offs.size() == 7) {
            throw new IllegalStateException("app.schedule.default-weekly-offs must leave at least one working day.");
        }
        if (defaultHoursPerDay == null || defaultHoursPerDay.signum() <= 0
                || defaultHoursPerDay.compareTo(BigDecimal.valueOf(24)) > 0) {
            throw new IllegalStateException("app.schedule.default-hours-per-day must be more than 0 and at most 24.");
        }
        this.defaultSchedule = new WorkCalendar.Schedule(null, offs, defaultHoursPerDay);
    }

    public WorkCalendar.Schedule defaultSchedule() {
        return defaultSchedule;
    }

    /** The calendar of one employee, with the holidays between from and to. */
    @Transactional(readOnly = true)
    public WorkCalendar calendarFor(long employeeId, LocalDate from, LocalDate to) {
        List<WorkCalendar.Schedule> saved = schedules.findByEmployeeIdOrderByEffectiveFromAsc(employeeId).stream()
                .map(WorkSchedule::toSchedule)
                .toList();
        Map<LocalDate, String> holidayNames = holidays.findByHolidayDateBetweenOrderByHolidayDateAsc(from, to).stream()
                .collect(Collectors.toMap(CompanyHoliday::getDate, CompanyHoliday::getName, (a, b) -> a));
        return new WorkCalendar(defaultSchedule, saved, holidayNames);
    }

    /** Checks a requested date range (both dates included). */
    static void checkRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw ApiException.invalid(from == null ? "from" : "to", "Choose a start and end date.");
        }
        if (to.isBefore(from)) {
            throw ApiException.invalid("to", "The end date must be on or after the start date.");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_RANGE_DAYS) {
            throw ApiException.invalid("to", "Choose at most " + MAX_RANGE_DAYS + " days at a time.");
        }
    }

    /** "SATURDAY, sunday" -> {SATURDAY, SUNDAY}. Throws IllegalStateException for unknown names. */
    static Set<DayOfWeek> parseDays(String value) {
        Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
        if (value == null || value.isBlank()) {
            return days;
        }
        for (String part : value.split(",")) {
            String name = part.trim().toUpperCase(Locale.ROOT);
            if (name.isEmpty()) {
                continue;
            }
            try {
                days.add(DayOfWeek.valueOf(name));
            } catch (IllegalArgumentException ex) {
                throw new IllegalStateException("Unknown day in app.schedule.default-weekly-offs: " + part.trim());
            }
        }
        return days;
    }
}
