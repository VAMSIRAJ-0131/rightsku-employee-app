package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * An employee's days between two dates. kind is WORKING, WEEKLY_OFF or
 * HOLIDAY; only WORKING days accept a timesheet. weeklyOff is also true for
 * a holiday that falls on a weekly off.
 */
public record CalendarResponse(LocalDate from, LocalDate to, LocalDate today, List<Day> days) {

    public record Day(LocalDate date, String kind, boolean weeklyOff, String holidayName, BigDecimal hoursPerDay) {

        static Day from(WorkCalendar.Day d) {
            return new Day(d.date(), d.kind().name(), d.weeklyOff(), d.holidayName(), d.hoursPerDay());
        }
    }
}
