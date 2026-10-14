package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

/**
 * An employee's schedules: the one in force today, changes that start
 * later, every saved schedule (newest first) and the company default.
 */
public record ScheduleResponse(
    Long employeeId,
    View current,
    List<View> upcoming,
    List<View> saved,
    View companyDefault
) {

    /** effectiveFrom is null for the company default. */
    public record View(LocalDate effectiveFrom, List<String> weeklyOffs, BigDecimal hoursPerDay, boolean companyDefault) {

        static View from(WorkCalendar.Schedule s) {
            List<String> offs = s.weeklyOffs().stream().sorted().map(DayOfWeek::name).toList();
            return new View(s.effectiveFrom(), offs, s.hoursPerDay(), s.effectiveFrom() == null);
        }
    }
}
