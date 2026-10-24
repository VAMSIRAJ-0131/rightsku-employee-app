package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * HR review of timesheets. Employees send a week at a time (or, with the
 * older submit, single days); HR sees one row per employee and week and
 * approves or rejects the days of that week that are still PENDING.
 */
@Service
public class HrTimesheetService {

    /** Approved and rejected lists go back this far (pending ones are always all shown). */
    static final int HISTORY_DAYS = 93;

    private final TimesheetEntryRepository entries;
    private final EmployeeRepository employees;
    private final LeaveRequestRepository leaveRequests;
    private final AuditEntryRepository audit;
    private final NotificationService notifications;
    private final WorkCalendarService calendars;
    private final LeaveDays leaveDays;
    private final Clock clock;

    public HrTimesheetService(
            TimesheetEntryRepository entries,
            EmployeeRepository employees,
            LeaveRequestRepository leaveRequests,
            AuditEntryRepository audit,
            NotificationService notifications,
            WorkCalendarService calendars,
            LeaveDays leaveDays,
            Clock clock) {
        this.entries = entries;
        this.employees = employees;
        this.leaveRequests = leaveRequests;
        this.audit = audit;
        this.notifications = notifications;
        this.calendars = calendars;
        this.leaveDays = leaveDays;
        this.clock = clock;
    }

    /**
     * Past working days of the week with no timesheet entry and no leave
     * (approved or waiting): the 0-hour days the employee declared as LOP
     * because no paid leave was left. Weekly offs, holidays and days before
     * joining are never listed.
     */
    private List<LocalDate> zeroHourDays(Employee person, LocalDate monday) {
        if (person == null) {
            return List.of();
        }
        LocalDate sunday = monday.plusDays(6);
        LocalDate today = LocalDate.now(clock);
        List<LeaveDays.LeaveDay> leave = leaveDays.leaveBetween(person.getId(), monday, sunday);
        Set<LocalDate> onLeave = leave.stream()
                .filter(l -> l.status() != LeaveDays.Status.REJECTED)
                .map(LeaveDays.LeaveDay::date).collect(Collectors.toSet());
        Set<LocalDate> withEntry = entries.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(person.getId(), monday, sunday)
                .stream().map(TimesheetEntry::getWorkDate).collect(Collectors.toSet());
        WeekTarget target = WeekTarget.of(calendars.calendarFor(person.getId(), monday, sunday).days(monday, sunday),
                person.getJoiningDate(), leave);
        return target.days().stream()
                .filter(d -> d.takesHours() && !d.date().isAfter(today)
                        && !withEntry.contains(d.date()) && !onLeave.contains(d.date()))
                .map(WeekTarget.Day::date)
                .toList();
    }

    /** Weeks with entries in this status (PENDING by default), newest week first. */
    @Transactional(readOnly = true)
    public List<HrTimesheetWeekResponse> weeks(String status) {
        String wanted = status == null || status.isBlank() ? TimesheetEntry.STATUS_PENDING : status.trim().toUpperCase(Locale.ROOT);
        if (!Set.of(TimesheetEntry.STATUS_PENDING, TimesheetEntry.STATUS_APPROVED, TimesheetEntry.STATUS_REJECTED).contains(wanted)) {
            throw ApiException.invalid("status", "Choose PENDING, APPROVED or REJECTED.");
        }
        LocalDate from = TimesheetEntry.STATUS_PENDING.equals(wanted)
                ? LocalDate.of(2000, 1, 1)
                : LocalDate.now(clock).minusDays(HISTORY_DAYS);
        List<TimesheetEntry> rows = entries.findByStatusAndWorkDateGreaterThanEqualOrderByWorkDateDesc(wanted, from);

        Map<Long, Employee> people = new HashMap<>();
        for (Employee e : employees.findAllById(rows.stream().map(TimesheetEntry::getEmployeeId).collect(Collectors.toSet()))) {
            people.put(e.getId(), e);
        }

        Map<String, List<TimesheetEntry>> byWeek = new LinkedHashMap<>();
        for (TimesheetEntry e : rows) {
            byWeek.computeIfAbsent(e.getEmployeeId() + "/" + TimesheetService.mondayOf(e.getWorkDate()), k -> new ArrayList<>()).add(e);
        }
        List<HrTimesheetWeekResponse> result = new ArrayList<>();
        for (List<TimesheetEntry> week : byWeek.values()) {
            week.sort(Comparator.comparing(TimesheetEntry::getWorkDate));
            TimesheetEntry first = week.get(0);
            Employee person = people.get(first.getEmployeeId());
            LocalDate monday = TimesheetService.mondayOf(first.getWorkDate());
            BigDecimal total = week.stream().map(TimesheetEntry::getHours).reduce(BigDecimal.ZERO, BigDecimal::add);
            Instant submitted = week.stream().map(TimesheetEntry::getCreatedAt).filter(java.util.Objects::nonNull)
                    .max(Comparator.naturalOrder()).orElse(null);
            TimesheetEntry reviewed = week.stream().filter(x -> x.getReviewedAt() != null)
                    .max(Comparator.comparing(TimesheetEntry::getReviewedAt)).orElse(null);
            result.add(new HrTimesheetWeekResponse(
                    first.getEmployeeId(),
                    person == null ? null : person.getEmployeeCode(),
                    person == null ? null : (person.getFirstName() + " " + person.getLastName()).trim(),
                    monday, monday.plusDays(6), total, submitted, wanted,
                    reviewed == null ? null : reviewed.getReviewedAt(),
                    reviewed == null ? null : reviewed.getReviewNote(),
                    week.stream().map(TimesheetResponse::from).toList(),
                    zeroHourDays(person, monday)));
        }
        result.sort(Comparator.comparing(HrTimesheetWeekResponse::weekStart).reversed()
                .thenComparing(w -> w.employeeName() == null ? "" : w.employeeName()));
        return result;
    }

    /**
     * Approves or rejects every PENDING day of one employee's week, in one
     * statement. Days already reviewed are not touched. If nothing was
     * pending (for example another HR admin just decided it), 409.
     */
    @Transactional
    public HrTimesheetWeekResponse review(TimesheetReviewRequest request, Long reviewerUserId) {
        String decision = request.decision().trim().toUpperCase(Locale.ROOT);
        String newStatus = switch (decision) {
            case "APPROVE" -> TimesheetEntry.STATUS_APPROVED;
            case "REJECT" -> TimesheetEntry.STATUS_REJECTED;
            default -> throw ApiException.invalid("decision", "Choose Approve or Reject.");
        };
        LocalDate monday = request.weekStart();
        if (monday.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw ApiException.invalid("weekStart", "A timesheet week starts on a Monday.");
        }
        Employee person = employees.findById(request.employeeId())
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
        String note = cleanNote(request.note());

        Instant now = clock.instant();
        int changed = entries.reviewPending(person.getId(), monday, monday.plusDays(6), newStatus, reviewerUserId, now, note);
        if (changed == 0) {
            throw ApiException.conflict(null, "This week has no timesheet waiting for review. It may have been reviewed already.");
        }
        audit.save(AuditEntry.of(reviewerUserId,
                TimesheetEntry.STATUS_APPROVED.equals(newStatus) ? "TIMESHEET_APPROVED" : "TIMESHEET_REJECTED",
                "TIMESHEET_WEEK", person.getEmployeeCode() + "/" + monday));
        notifications.timesheetReviewed(person, monday, TimesheetEntry.STATUS_APPROVED.equals(newStatus), note);

        List<TimesheetEntry> week = new ArrayList<>(entries.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(
                person.getId(), monday, monday.plusDays(6)));
        week.removeIf(e -> !newStatus.equals(e.getStatus()));
        week.sort(Comparator.comparing(TimesheetEntry::getWorkDate));
        BigDecimal total = week.stream().map(TimesheetEntry::getHours).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new HrTimesheetWeekResponse(person.getId(), person.getEmployeeCode(),
                (person.getFirstName() + " " + person.getLastName()).trim(), monday, monday.plusDays(6), total,
                week.stream().map(TimesheetEntry::getCreatedAt).filter(java.util.Objects::nonNull)
                        .max(Comparator.naturalOrder()).orElse(null),
                newStatus, now, note, week.stream().map(TimesheetResponse::from).toList(), zeroHourDays(person, monday));
    }

    /** Pending, approved and rejected counts for timesheets (per employee-week) and leave requests. */
    @Transactional(readOnly = true)
    public ApprovalSummaryResponse summary() {
        Map<String, Long> ts = toCounts(entries.countWeeksByStatus());
        Map<String, Long> lv = toCounts(leaveRequests.countByStatusGrouped());
        return new ApprovalSummaryResponse(
                new ApprovalSummaryResponse.Counts(ts.getOrDefault("PENDING", 0L), ts.getOrDefault("APPROVED", 0L), ts.getOrDefault("REJECTED", 0L)),
                new ApprovalSummaryResponse.Counts(lv.getOrDefault("PENDING", 0L), lv.getOrDefault("APPROVED", 0L), lv.getOrDefault("REJECTED", 0L)));
    }

    private static Map<String, Long> toCounts(List<Object[]> rows) {
        Map<String, Long> result = new HashMap<>();
        for (Object[] row : rows) {
            result.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }
        return result;
    }

    static String cleanNote(String note) {
        if (note == null) {
            return null;
        }
        String value = note.replaceAll("[\\p{Cntrl}&&[^\\n]]", " ").strip();
        if (value.length() > 500) {
            throw ApiException.invalid("note", "Note must be at most 500 characters.");
        }
        return value.isEmpty() ? null : value;
    }
}
