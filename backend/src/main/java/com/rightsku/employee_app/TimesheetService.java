package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Timesheets submitted by employees, checked against their working calendar.
 *
 * <ul>
 *   <li>The employee is always the signed-in user (from the token).</li>
 *   <li>Only working days: weekly offs (from the HR schedule in force on that
 *       date) and company holidays are refused.</li>
 *   <li>No future dates, nothing older than {@value #MAX_DAYS_BACK} days, and
 *       nothing before the joining date.</li>
 *   <li>One entry per date; hours from {@value #MIN_HOURS_PER_DAY} to {@value #MAX_HOURS_PER_DAY} in steps of
 *       0.25 (15 minutes).</li>
 * </ul>
 * The same rules are shown in the app (non-working dates are disabled), but
 * the server is what enforces them.
 */
@Service
public class TimesheetService {

    static final int MAX_DAYS_BACK = 60;
    private static final BigDecimal QUARTER = new BigDecimal("0.25");
    /** Fewest and most hours an employee can log for one working day. */
    static final int MIN_HOURS_PER_DAY = 1;
    static final int MAX_HOURS_PER_DAY = 9;
    private static final BigDecimal MIN_HOURS = BigDecimal.valueOf(MIN_HOURS_PER_DAY);
    private static final BigDecimal MAX_HOURS = BigDecimal.valueOf(MAX_HOURS_PER_DAY);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);

    private final TimesheetEntryRepository entries;
    private final EmployeeRepository employees;
    private final WorkCalendarService calendarService;
    private final Clock clock;

    public TimesheetService(
            TimesheetEntryRepository entries,
            EmployeeRepository employees,
            WorkCalendarService calendarService,
            Clock clock) {
        this.entries = entries;
        this.employees = employees;
        this.calendarService = calendarService;
        this.clock = clock;
    }

    @Transactional
    public TimesheetResponse submit(long userId, TimesheetRequest request) {
        Employee me = currentEmployee(userId);
        LocalDate today = LocalDate.now(clock);
        LocalDate date = request.date();

        if (date.isAfter(today)) {
            throw ApiException.invalid("date", "You can't submit a timesheet for a future date.");
        }
        if (date.isBefore(today.minusDays(MAX_DAYS_BACK))) {
            throw ApiException.invalid("date", "Timesheets can be submitted for the last " + MAX_DAYS_BACK + " days only.");
        }
        if (me.getJoiningDate() != null && date.isBefore(me.getJoiningDate())) {
            throw ApiException.invalid("date", "That date is before your joining date.");
        }

        WorkCalendar.Day day = calendarService.calendarFor(me.getId(), date, date).day(date);
        if (day.kind() == WorkCalendar.DayKind.HOLIDAY) {
            throw ApiException.invalid("date",
                    DAY.format(date) + " is a company holiday (" + day.holidayName() + "). Timesheets can't be submitted for holidays.");
        }
        if (day.kind() == WorkCalendar.DayKind.WEEKLY_OFF) {
            throw ApiException.invalid("date",
                    DAY.format(date) + " is your weekly off. Timesheets can only be submitted for working days.");
        }

        BigDecimal hours = checkHours(request.hours());
        String description = cleanDescription(request.description());

        if (entries.existsByEmployeeIdAndWorkDate(me.getId(), date)) {
            throw ApiException.conflict("date", "You already submitted a timesheet for this date.");
        }
        TimesheetEntry entry = TimesheetEntry.submit(me.getId(), date, hours, description);
        try {
            entries.saveAndFlush(entry);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict("date", "You already submitted a timesheet for this date.");
        }
        return TimesheetResponse.from(entry);
    }

    @Transactional(readOnly = true)
    public List<TimesheetResponse> listMine(long userId, LocalDate from, LocalDate to) {
        WorkCalendarService.checkRange(from, to);
        Employee me = currentEmployee(userId);
        return entries.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(me.getId(), from, to).stream()
                .map(TimesheetResponse::from)
                .toList();
    }

    /** The signed-in employee's working days, weekly offs and holidays. */
    @Transactional(readOnly = true)
    public CalendarResponse calendarMine(long userId, LocalDate from, LocalDate to) {
        WorkCalendarService.checkRange(from, to);
        Employee me = currentEmployee(userId);
        WorkCalendar calendar = calendarService.calendarFor(me.getId(), from, to);
        return new CalendarResponse(from, to, LocalDate.now(clock),
                calendar.days(from, to).stream().map(CalendarResponse.Day::from).toList());
    }

    private Employee currentEmployee(long userId) {
        return employees.findByUser_Id(userId)
                .orElseThrow(() -> ApiException.notFound("Employee record not found."));
    }

    static BigDecimal checkHours(BigDecimal hours) {
        if (hours == null || hours.compareTo(MIN_HOURS) < 0 || hours.compareTo(MAX_HOURS) > 0
                || hours.remainder(QUARTER).signum() != 0) {
            throw ApiException.invalid("hours", "Enter hours from " + MIN_HOURS_PER_DAY + " to " + MAX_HOURS_PER_DAY
                    + ", in steps of 0.25 (15 minutes).");
        }
        return hours.setScale(2, RoundingMode.UNNECESSARY);
    }

    private static String cleanDescription(String description) {
        String value = description == null ? "" : description.replaceAll("[\\p{Cntrl}&&[^\\n]]", " ").strip();
        if (value.isEmpty()) {
            throw ApiException.invalid("description", "Describe the work done.");
        }
        if (value.length() > 500) {
            throw ApiException.invalid("description", "Description must be at most 500 characters.");
        }
        return value;
    }
}
