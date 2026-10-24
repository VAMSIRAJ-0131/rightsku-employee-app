package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Weekly timesheets of the signed-in employee, checked against their working
 * calendar, company holidays and approved leave.
 *
 * <ul>
 *   <li>The employee is always the signed-in user (from the token).</li>
 *   <li>A week runs Monday to Sunday. It can be filled in from the oldest week
 *       that touches the last {@value #MAX_DAYS_BACK} days up to this week.</li>
 *   <li>Save keeps a draft that can be changed any time. Submit sends the
 *       whole week for approval in one step; after that the week can't be
 *       saved or submitted again.</li>
 *   <li>Only working days take hours: weekly offs (from the HR schedule in
 *       force on that date), company holidays, full days of approved leave
 *       and days before the joining date are refused.</li>
 *   <li>Each day takes {@value #MIN_HOURS_PER_DAY} to {@value #MAX_HOURS_PER_DAY}
 *       hours in steps of 0.25 (15 minutes).</li>
 *   <li>Submitting opens on the week's last working day. The hours must
 *       exactly match the week's target ({@link WeekTarget}: 45 hours for five
 *       9-hour days, less for holidays and approved leave). An empty working
 *       day is allowed only while its leave is waiting for HR, or as LOP when
 *       no paid leave is left; with paid leave left, the employee must apply
 *       for leave or enter hours ({@link WeekSubmission}).</li>
 *   <li>Days submitted one at a time (the older one-day submit, still
 *       available for app versions installed earlier) count towards the week
 *       and can't be changed. When every working day of a week was submitted
 *       that way, the week is "already submitted": nothing to save or submit.</li>
 * </ul>
 * The app shows the same rules, but the server is what enforces them.
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
    static final String HOURS_MESSAGE = "Enter hours from " + MIN_HOURS_PER_DAY + " to " + MAX_HOURS_PER_DAY
            + ", in steps of 0.25 (15 minutes).";
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);

    static final String NOT_STARTED = "NOT_STARTED";
    /** Every working day of the week was already submitted one day at a time. */
    static final String ALREADY_SUBMITTED = "ALREADY_SUBMITTED";
    static final String ALREADY_SUBMITTED_MESSAGE =
            "All working days of this week were already submitted, so there is nothing to save or submit.";

    private final TimesheetEntryRepository entries;
    private final TimesheetWeekRepository weeks;
    private final EmployeeRepository employees;
    private final WorkCalendarService calendarService;
    private final LeaveDays leaveDays;
    private final PaidLeaveCheck paidLeave;
    private final Clock clock;

    public TimesheetService(
            TimesheetEntryRepository entries,
            TimesheetWeekRepository weeks,
            EmployeeRepository employees,
            WorkCalendarService calendarService,
            LeaveDays leaveDays,
            PaidLeaveCheck paidLeave,
            Clock clock) {
        this.entries = entries;
        this.weeks = weeks;
        this.employees = employees;
        this.calendarService = calendarService;
        this.leaveDays = leaveDays;
        this.paidLeave = paidLeave;
        this.clock = clock;
    }

    /* ---------- Reading ---------- */

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

    /** One week: days, saved hours, status and the target. */
    @Transactional(readOnly = true)
    public WeekTimesheetResponse weekMine(long userId, LocalDate weekStart) {
        Employee me = currentEmployee(userId);
        WeekState state = load(me, weekStart, false);
        return state.response(LocalDate.now(clock));
    }

    /* ---------- Save (draft) ---------- */

    /**
     * Saves the week as a draft. Nothing is sent for approval. Refused once
     * the week is submitted, so a submission is never overwritten.
     */
    @Transactional
    public WeekTimesheetResponse saveDraft(long userId, WeekTimesheetRequest request) {
        Employee me = currentEmployee(userId);
        WeekState state = load(me, request.weekStart(), true);
        if (state.week != null && state.week.isSubmitted()) {
            throw ApiException.conflict(null, "This week has already been submitted, so it can't be saved as a draft.");
        }
        if (state.allDaysSubmittedEarlier()) {
            throw ApiException.conflict(null, ALREADY_SUBMITTED_MESSAGE);
        }
        Map<LocalDate, BigDecimal> hours = checkDays(state, request.days());
        String description = cleanDescription(request.description(), false);

        TimesheetWeek week = state.week != null ? state.week : TimesheetWeek.start(me.getId(), state.weekStart);
        week.saveDraft(hours, description);
        state.week = saveWeek(week);
        return state.response(LocalDate.now(clock));
    }

    /* ---------- Submit for approval ---------- */

    /**
     * Sends the whole week for approval in one step: every day is checked,
     * the week must reach its target, and then one PENDING entry is created
     * per day. If anything is wrong, nothing is saved.
     */
    @Transactional
    public WeekTimesheetResponse submitWeek(long userId, WeekTimesheetRequest request) {
        Employee me = currentEmployee(userId);
        LocalDate today = LocalDate.now(clock);
        WeekState state = load(me, request.weekStart(), true);
        if (state.week != null && state.week.isSubmitted()) {
            throw ApiException.conflict(null, "This week has already been submitted.");
        }
        if (state.allDaysSubmittedEarlier()) {
            throw ApiException.conflict(null, ALREADY_SUBMITTED_MESSAGE);
        }
        Map<LocalDate, BigDecimal> hours = checkDays(state, request.days());
        String description = cleanDescription(request.description(), true);

        LocalDate opensOn = state.target.lastWorkingDay();
        if (opensOn == null) {
            throw ApiException.invalid("target", "This week has no working days to submit.");
        }
        if (today.isBefore(opensOn)) {
            throw ApiException.invalid("target", "You can submit this week from " + DAY.format(opensOn)
                    + ", its last working day. Save it as a draft until then.");
        }
        if (hours.values().stream().noneMatch(h -> h.signum() > 0) && state.entries.isEmpty()) {
            throw ApiException.invalid("target", "Enter hours for at least one working day.");
        }
        WeekSubmission check = state.submission(hours, paidLeave.hasPaidLeaveAvailable(me.getId()));
        if (check.problem() != null) {
            throw ApiException.invalid("target", check.problem());
        }

        TimesheetWeek week = state.week != null ? state.week : TimesheetWeek.start(me.getId(), state.weekStart);
        week.markSubmitted(description, clock.instant());
        try {
            for (Map.Entry<LocalDate, BigDecimal> day : hours.entrySet()) {
                if (day.getValue().signum() == 0) {
                    continue;   // a day not worked has no entry: it stays empty (LOP or leave waiting)
                }
                entries.saveAndFlush(TimesheetEntry.submit(me.getId(), day.getKey(), day.getValue(), description));
            }
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict(null, "This week has already been submitted.");
        }
        state.week = saveWeek(week);
        state.entries = entries.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(
                me.getId(), state.weekStart, state.weekStart.plusDays(6));
        return state.response(today);
    }

    /* ---------- One day (older app versions) ---------- */

    /**
     * The older one-day submit. Each day gets the same checks as the weekly
     * screen; the weekly target can't be checked one day at a time. Errors
     * use the same fields as before (date, hours, description), so older app
     * versions keep showing them next to the right box.
     */
    @Transactional
    public TimesheetResponse submitOneDay(long userId, TimesheetRequest request) {
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

        // Locks the week like Save and Submit, so they never run at the same time for one week.
        WeekState state = load(me, mondayOf(date), true);
        if (state.week != null && state.week.isSubmitted()) {
            throw ApiException.conflict("date", "This week has already been submitted, so no more days can be added.");
        }
        WeekTarget.Day plan = state.target.day(date);
        if (!plan.takesHours()) {
            throw ApiException.invalid("date", whyNoHours(plan));
        }
        if (!validHours(request.hours())) {
            throw ApiException.invalid("hours", HOURS_MESSAGE);
        }
        String description = cleanDescription(request.description(), true);
        if (state.submittedOn(date) != null) {
            throw ApiException.conflict("date", "You already submitted a timesheet for this date.");
        }

        TimesheetEntry entry = TimesheetEntry.submit(me.getId(), date, request.hours().setScale(2, RoundingMode.UNNECESSARY), description);
        try {
            entries.saveAndFlush(entry);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict("date", "You already submitted a timesheet for this date.");
        }
        // A draft value for this day is no longer needed: the submitted entry replaces it.
        if (state.week != null && state.week.getDraftHours().containsKey(date)) {
            state.week.removeDraftDay(date);
            saveWeek(state.week);
        }
        return TimesheetResponse.from(entry);
    }

    /* ---------- Rules ---------- */

    /** The week's calendar, target, saved draft and submitted entries, after checking the week itself. */
    private WeekState load(Employee me, LocalDate weekStart, boolean forUpdate) {
        LocalDate today = LocalDate.now(clock);
        if (weekStart == null) {
            throw ApiException.invalid("weekStart", "Choose the week.");
        }
        if (weekStart.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw ApiException.invalid("weekStart", "A timesheet week starts on a Monday.");
        }
        if (weekStart.isAfter(mondayOf(today))) {
            throw ApiException.invalid("weekStart", "You can't fill in a timesheet for a future week.");
        }
        if (weekStart.isBefore(mondayOf(today.minusDays(MAX_DAYS_BACK)))) {
            throw ApiException.invalid("weekStart", "Timesheets can be filled in for the last " + MAX_DAYS_BACK + " days only.");
        }
        LocalDate weekEnd = weekStart.plusDays(6);
        if (me.getJoiningDate() != null && weekEnd.isBefore(me.getJoiningDate())) {
            throw ApiException.invalid("weekStart", "That week is before your joining date.");
        }

        WorkCalendar calendar = calendarService.calendarFor(me.getId(), weekStart, weekEnd);
        List<LeaveDays.LeaveDay> leave = leaveDays.leaveBetween(me.getId(), weekStart, weekEnd);
        WeekTarget target = WeekTarget.of(calendar.days(weekStart, weekEnd), me.getJoiningDate(), leave);
        Set<LocalDate> pendingLeave = new HashSet<>();
        for (LeaveDays.LeaveDay l : leave) {
            if (l.status() == LeaveDays.Status.PENDING) {
                pendingLeave.add(l.date());
            }
        }
        TimesheetWeek week = (forUpdate
                ? weeks.findForUpdateByEmployeeIdAndWeekStart(me.getId(), weekStart)
                : weeks.findByEmployeeIdAndWeekStart(me.getId(), weekStart)).orElse(null);
        List<TimesheetEntry> submitted = entries.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(
                me.getId(), weekStart, weekEnd);
        return new WeekState(weekStart, target, week, submitted, pendingLeave, me.getId());
    }

    /** Checks each day sent; returns the hours to keep (days without hours are left out). */
    private static Map<LocalDate, BigDecimal> checkDays(WeekState state, List<WeekTimesheetRequest.DayHours> days) {
        Map<LocalDate, BigDecimal> result = new TreeMap<>();
        Set<LocalDate> seen = new HashSet<>();
        if (days == null) {
            throw ApiException.invalid("days", "Send the days of the week.");
        }
        for (WeekTimesheetRequest.DayHours day : days) {
            if (day == null || day.date() == null) {
                throw ApiException.invalid("days", "Each day needs a date.");
            }
            LocalDate date = day.date();
            String field = dayField(date);
            if (date.isBefore(state.weekStart) || date.isAfter(state.weekStart.plusDays(6))) {
                throw ApiException.invalid(field, DAY.format(date) + " is not in this week.");
            }
            if (!seen.add(date)) {
                throw ApiException.invalid(field, DAY.format(date) + " was sent twice.");
            }
            if (day.hours() == null) {
                continue; // an empty box: this day has no hours
            }
            if (state.submittedOn(date) != null) {
                throw ApiException.conflict(field, DAY.format(date) + " was already submitted and can't be changed.");
            }
            WeekTarget.Day plan = state.target.day(date);
            if (!plan.takesHours()) {
                throw ApiException.invalid(field, whyNoHours(plan));
            }
            if (day.hours().signum() == 0) {
                result.put(date, BigDecimal.ZERO.setScale(2));   // "did not work": LOP or leave, see WeekSubmission
                continue;
            }
            if (!validHours(day.hours())) {
                throw ApiException.invalid(field, HOURS_MESSAGE);
            }
            result.put(date, day.hours().setScale(2, RoundingMode.UNNECESSARY));
        }
        return result;
    }

    private static String whyNoHours(WeekTarget.Day plan) {
        String day = DAY.format(plan.date());
        if (plan.beforeJoining()) {
            return day + " is before your joining date.";
        }
        if (plan.kind() == WorkCalendar.DayKind.HOLIDAY) {
            return day + " is a company holiday (" + plan.holidayName() + "). It can't take hours.";
        }
        if (plan.weeklyOff()) {
            return day + " is your weekly off. Only working days can take hours.";
        }
        return day + " is a full day of approved leave. It can't take hours.";
    }

    /** Field name for one day's error, e.g. "days[2026-10-12]", so the app can show it on that row. */
    static String dayField(LocalDate date) {
        return "days[" + date + "]";
    }

    /** One day's hours: 1 to 9 in steps of 0.25 (15 minutes). */
    static boolean validHours(BigDecimal hours) {
        return hours != null && hours.compareTo(MIN_HOURS) >= 0 && hours.compareTo(MAX_HOURS) <= 0
                && hours.remainder(QUARTER).signum() == 0;
    }

    private TimesheetWeek saveWeek(TimesheetWeek week) {
        try {
            return weeks.saveAndFlush(week);
        } catch (DataIntegrityViolationException ex) {
            // Another save of the same new week got there first (for example a double tap).
            throw ApiException.conflict(null, "This week was just changed. Open it again and try once more.");
        }
    }

    private Employee currentEmployee(long userId) {
        return employees.findByUser_Id(userId)
                .orElseThrow(() -> ApiException.notFound("Employee record not found."));
    }

    private static String cleanDescription(String description, boolean required) {
        String value = description == null ? "" : description.replaceAll("[\\p{Cntrl}&&[^\\n]]", " ").strip();
        if (value.isEmpty()) {
            if (required) {
                throw ApiException.invalid("description", "Describe the work done.");
            }
            return null;
        }
        if (value.length() > 500) {
            throw ApiException.invalid("description", "Description must be at most 500 characters.");
        }
        return value;
    }

    static LocalDate mondayOf(LocalDate date) {
        return date.minusDays(date.getDayOfWeek().getValue() - 1L);
    }

    private static BigDecimal sum(Iterable<BigDecimal> values) {
        BigDecimal total = BigDecimal.ZERO.setScale(2);
        for (BigDecimal v : values) {
            total = total.add(v);
        }
        return total;
    }

    /** 4.50 -> "4.5", 45.00 -> "45". */
    static String plain(BigDecimal value) {
        BigDecimal stripped = value.stripTrailingZeros();
        return (stripped.scale() < 0 ? stripped.setScale(0) : stripped).toPlainString();
    }

    /* ---------- One week, loaded ---------- */

    private final class WeekState {
        final LocalDate weekStart;
        final WeekTarget target;
        TimesheetWeek week;
        List<TimesheetEntry> entries;
        final Set<LocalDate> pendingLeave;
        final long employeeId;

        WeekState(LocalDate weekStart, WeekTarget target, TimesheetWeek week, List<TimesheetEntry> entries,
                Set<LocalDate> pendingLeave, long employeeId) {
            this.weekStart = weekStart;
            this.target = target;
            this.week = week;
            this.entries = entries;
            this.pendingLeave = pendingLeave;
            this.employeeId = employeeId;
        }

        /** The submission rules for these hours (see WeekSubmission). */
        WeekSubmission submission(Map<LocalDate, BigDecimal> hours, boolean paidLeaveAvailable) {
            Set<LocalDate> submittedDates = new HashSet<>();
            for (TimesheetEntry e : entries) {
                submittedDates.add(e.getWorkDate());
            }
            return WeekSubmission.check(target, hours, submittedDates, lockedHours(), pendingLeave, paidLeaveAvailable);
        }

        TimesheetEntry submittedOn(LocalDate date) {
            for (TimesheetEntry e : entries) {
                if (e.getWorkDate().equals(date)) {
                    return e;
                }
            }
            return null;
        }

        /**
         * True when the week was not submitted as a whole, but every day that
         * takes hours already has an entry (submitted one day at a time).
         */
        boolean allDaysSubmittedEarlier() {
            if ((week != null && week.isSubmitted()) || target.lastWorkingDay() == null) {
                return false;
            }
            for (WeekTarget.Day d : target.days()) {
                if (d.takesHours() && submittedOn(d.date()) == null) {
                    return false;
                }
            }
            return true;
        }

        /** Hours already submitted in this week that count as worked (rejected days don't). */
        BigDecimal lockedHours() {
            BigDecimal total = BigDecimal.ZERO.setScale(2);
            for (TimesheetEntry e : entries) {
                if (!"REJECTED".equals(e.getStatus())) {
                    total = total.add(e.getHours());
                }
            }
            return total;
        }

        WeekTimesheetResponse response(LocalDate today) {
            boolean submitted = week != null && week.isSubmitted();
            Map<LocalDate, BigDecimal> draft = week == null ? Map.of() : week.getDraftHours();
            Map<LocalDate, TimesheetEntry> byDate = new HashMap<>();
            for (TimesheetEntry e : entries) {
                byDate.put(e.getWorkDate(), e);
            }

            Map<LocalDate, BigDecimal> draftHours = new HashMap<>();
            for (WeekTarget.Day d : target.days()) {
                if (!submitted && byDate.get(d.date()) == null && d.takesHours() && draft.containsKey(d.date())) {
                    draftHours.put(d.date(), draft.get(d.date()));
                }
            }
            // After submitting, an empty day is LOP or pending leave: submitting
            // was only possible that way, whatever the leave balance is now.
            boolean paidLeaveAvailable = !submitted && paidLeave.hasPaidLeaveAvailable(employeeId);
            Map<LocalDate, BigDecimal> checked = draftHours;
            if (submitted) {
                // Submitting needed every day filled, so a day without an entry was sent as 0 hours.
                checked = new HashMap<>(draftHours);
                for (WeekTarget.Day d : target.days()) {
                    if (d.takesHours() && byDate.get(d.date()) == null) {
                        checked.put(d.date(), BigDecimal.ZERO.setScale(2));
                    }
                }
            }
            WeekSubmission check = submission(checked, paidLeaveAvailable);
            Map<LocalDate, WeekSubmission.Empty> emptyMeaning = new HashMap<>();
            for (WeekSubmission.EmptyDay e : check.emptyDays()) {
                emptyMeaning.put(e.date(), e.meaning());
            }

            List<WeekTimesheetResponse.Day> days = new ArrayList<>();
            BigDecimal entered = check.enteredHours();
            for (WeekTarget.Day d : target.days()) {
                TimesheetEntry entry = byDate.get(d.date());
                boolean editable = !submitted && entry == null && d.takesHours();
                BigDecimal hours = entry != null ? entry.getHours() : draftHours.get(d.date());
                WeekSubmission.Empty empty = emptyMeaning.get(d.date());
                days.add(new WeekTimesheetResponse.Day(d.date(), d.kind().name(), d.weeklyOff(), d.holidayName(),
                        d.beforeJoining(), d.leave() == null ? null : d.leave().name(), d.scheduledHours(),
                        d.targetHours(), hours, entry == null ? null : entry.getStatus(), editable,
                        pendingLeave.contains(d.date()), empty == null ? null : empty.name()));
            }

            WeekTarget.Totals t = target.totals();
            BigDecimal remaining = check.requiredHours().subtract(entered).max(BigDecimal.ZERO.setScale(2));
            LocalDate opensOn = target.lastWorkingDay();
            boolean allEarlier = allDaysSubmittedEarlier();
            String blocked = null;
            if (submitted) {
                blocked = "This week has already been submitted.";
            } else if (allEarlier) {
                blocked = ALREADY_SUBMITTED_MESSAGE;
            } else if (opensOn == null) {
                blocked = "This week has no working days to submit.";
            } else if (today.isBefore(opensOn)) {
                blocked = "You can submit this week from " + DAY.format(opensOn) + ", its last working day.";
            } else if (check.problem() != null) {
                blocked = check.problem();
            }
            String status = submitted ? TimesheetWeek.STATUS_SUBMITTED
                    : allEarlier ? ALREADY_SUBMITTED
                    : week != null ? TimesheetWeek.STATUS_DRAFT : NOT_STARTED;
            return new WeekTimesheetResponse(weekStart, weekStart.plusDays(6), today, status,
                    week == null ? null : week.getDescription(),
                    week == null || submitted || allEarlier ? null : week.getUpdatedAt(),
                    week == null ? null : week.getSubmittedAt(),
                    days,
                    new WeekTimesheetResponse.Target(t.scheduledHours(), t.holidayHours(), t.leaveHours(),
                            t.expectedHours(), entered, remaining, check.requiredHours(), check.lopDays()),
                    opensOn, blocked == null, blocked, paidLeaveAvailable);
        }
    }
}
