package com.rightsku.employee_app;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Monthly salary summary for HR (read only; nothing is changed).
 *
 * <p>Each calendar day of the month, from the employee's joining date, falls
 * into exactly one group, so nothing is counted twice:
 * <ol>
 *   <li><b>Holiday</b>: a company holiday (also when it falls on a weekly off). Paid.</li>
 *   <li><b>Weekly off</b>: per the employee's work schedule on that date. Paid.</li>
 *   <li>Otherwise it is a <b>working day</b>, and then the first that applies:
 *     <ol>
 *       <li><b>Not yet due</b>: after today (only while the month is not over).</li>
 *       <li><b>Paid leave</b>: covered by APPROVED leave (every leave type in the
 *           app is paid and can never exceed the balance). With an approved
 *           timesheet on the same day it still counts once, as leave, and is flagged.</li>
 *       <li><b>Present</b>: an APPROVED timesheet with hours.</li>
 *       <li><b>Pending</b>: a timesheet or leave waiting for HR, including a
 *           0-hour day of a submitted week that HR has not decided yet. Never LOP.</li>
 *       <li><b>LOP (absence)</b>: a 0-hour day of a submitted week that HR
 *           APPROVED. The app only lets a week be submitted with an empty
 *           working day when no paid leave is left (or its leave is still
 *           waiting), so this is the employee's declared Loss of Pay.</li>
 *       <li><b>Needs review</b>: anything else: no timesheet submitted for the
 *           week, a rejected timesheet, or an empty day whose leave HR
 *           rejected. Not LOP until HR decides; the row is flagged.</li>
 *     </ol>
 *   </li>
 * </ol>
 * <b>LOP days</b> = unpaid leave + LOP absences. <b>Payable days</b> = employed
 * days in the month - LOP days. Days before the joining date are neither paid
 * nor LOP. A row is <b>complete</b> only when the month is over and no day is
 * pending or needs review.
 */
@Service
public class SalarySummaryService {

    private final EmployeeRepository employees;
    private final TimesheetEntryRepository timesheets;
    private final TimesheetWeekRepository weeks;
    private final LeaveRequestRepository leaveRequests;
    private final WorkCalendarService calendars;
    private final Clock clock;

    public SalarySummaryService(
            EmployeeRepository employees,
            TimesheetEntryRepository timesheets,
            TimesheetWeekRepository weeks,
            LeaveRequestRepository leaveRequests,
            WorkCalendarService calendars,
            Clock clock) {
        this.employees = employees;
        this.timesheets = timesheets;
        this.weeks = weeks;
        this.leaveRequests = leaveRequests;
        this.calendars = calendars;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public SalarySummaryResponse summary(int year, int month) {
        if (year < 2000 || year > 2100 || month < 1 || month > 12) {
            throw ApiException.invalid("month", "Choose a month and a year between 2000 and 2100.");
        }
        YearMonth ym = YearMonth.of(year, month);
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.atEndOfMonth();
        LocalDate today = LocalDate.now(clock);
        if (from.isAfter(today)) {
            throw ApiException.invalid("month", "This month has not started yet.");
        }
        boolean provisional = !to.isBefore(today);   // the month (including today) is not over

        List<SalarySummaryResponse.Row> rows = new ArrayList<>();
        for (Employee e : employees.findAll(Sort.by("employeeCode"))) {
            LocalDate joined = e.getJoiningDate();
            if (joined != null && joined.isAfter(to)) {
                continue;   // joined after this month
            }
            SalarySummaryResponse.Row row = rowFor(e, from, to, today, provisional, rows.size() + 1);
            if (row != null) {
                rows.add(row);
            }
        }
        return new SalarySummaryResponse(year, month, from, to, ym.lengthOfMonth(), provisional, today,
                clock.instant(), rows, totals(rows));
    }

    /** What HR decided about a submitted week, from its entries (HR reviews a week as a whole). */
    private enum WeekDecision { PENDING, APPROVED, REJECTED }

    private SalarySummaryResponse.Row rowFor(
            Employee e, LocalDate monthStart, LocalDate monthEnd, LocalDate today, boolean provisional, int serialNo) {
        List<String> flags = new ArrayList<>();
        LocalDate start = monthStart;
        if (e.getJoiningDate() == null) {
            flags.add("No joining date on file: counted from the 1st.");
        } else if (e.getJoiningDate().isAfter(monthStart)) {
            start = e.getJoiningDate();
            flags.add("Joined on " + start + ": days before that are not counted.");
        }

        // Whole weeks around the month, because HR decides a week as a whole.
        LocalDate firstMonday = TimesheetService.mondayOf(start);
        LocalDate lastSunday = TimesheetService.mondayOf(monthEnd).plusDays(6);

        Set<LocalDate> approvedWork = new HashSet<>();
        Set<LocalDate> pendingWork = new HashSet<>();
        Set<LocalDate> rejectedWork = new HashSet<>();
        Map<LocalDate, List<String>> weekStatuses = new HashMap<>();
        for (TimesheetEntry t : timesheets.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(e.getId(), firstMonday, lastSunday)) {
            LocalDate d = t.getWorkDate();
            weekStatuses.computeIfAbsent(TimesheetService.mondayOf(d), k -> new ArrayList<>()).add(t.getStatus());
            if (TimesheetEntry.STATUS_APPROVED.equals(t.getStatus()) && t.getHours() != null && t.getHours().signum() > 0) {
                approvedWork.add(d);
            } else if (TimesheetEntry.STATUS_PENDING.equals(t.getStatus())) {
                pendingWork.add(d);
            } else if (TimesheetEntry.STATUS_REJECTED.equals(t.getStatus())) {
                rejectedWork.add(d);
            }
        }
        Map<LocalDate, WeekDecision> submittedWeeks = new HashMap<>();
        for (TimesheetWeek w : weeks.findByEmployeeIdAndWeekStartBetween(e.getId(), firstMonday, lastSunday)) {
            if (!w.isSubmitted()) {
                continue;
            }
            List<String> statuses = weekStatuses.getOrDefault(w.getWeekStart(), List.of());
            WeekDecision decision = statuses.contains(TimesheetEntry.STATUS_PENDING) ? WeekDecision.PENDING
                    : statuses.contains(TimesheetEntry.STATUS_APPROVED) ? WeekDecision.APPROVED
                    : WeekDecision.REJECTED;
            submittedWeeks.put(w.getWeekStart(), decision);
        }

        Map<LocalDate, String> approvedLeave = new HashMap<>();
        Set<LocalDate> pendingLeave = new HashSet<>();
        Set<LocalDate> rejectedLeave = new HashSet<>();
        for (LeaveRequest r : leaveRequests.touching(e.getId(), start, monthEnd)) {
            for (LocalDate d = r.getStartDate(); !d.isAfter(r.getEndDate()); d = d.plusDays(1)) {
                if (d.isBefore(start) || d.isAfter(monthEnd)) {
                    continue;
                }
                if (LeaveRequest.STATUS_APPROVED.equals(r.getStatus())) {
                    approvedLeave.put(d, r.getLeaveType());
                } else if (LeaveRequest.STATUS_PENDING.equals(r.getStatus())) {
                    pendingLeave.add(d);
                } else {
                    rejectedLeave.add(d);
                }
            }
        }
        boolean anyActivity = !approvedWork.isEmpty() || !pendingWork.isEmpty() || !approvedLeave.isEmpty()
                || !pendingLeave.isEmpty() || !submittedWeeks.isEmpty();
        if (!e.isActive()) {
            if (!anyActivity) {
                return null;   // inactive and nothing recorded this month: not on the payroll
            }
            flags.add("Account inactive: confirm the last working day before paying.");
        }

        WorkCalendar calendar = calendars.calendarFor(e.getId(), start, monthEnd);
        int employed = 0, working = 0, present = 0, paidLeave = 0, holidays = 0, weeklyOffs = 0;
        int lopAbsences = 0, pending = 0, notYetDue = 0, leaveWithTimesheet = 0;
        int missing = 0, rejected = 0, leaveRejectedEmpty = 0;
        for (LocalDate d = start; !d.isAfter(monthEnd); d = d.plusDays(1)) {
            employed++;
            WorkCalendar.Day day = calendar.day(d);
            if (day.kind() == WorkCalendar.DayKind.HOLIDAY) {
                holidays++;
                continue;
            }
            if (day.kind() == WorkCalendar.DayKind.WEEKLY_OFF) {
                weeklyOffs++;
                continue;
            }
            working++;
            WeekDecision week = submittedWeeks.get(TimesheetService.mondayOf(d));
            if (d.isAfter(today)) {
                notYetDue++;
            } else if (approvedLeave.containsKey(d)) {
                paidLeave++;
                if (approvedWork.contains(d)) {
                    leaveWithTimesheet++;
                }
            } else if (approvedWork.contains(d)) {
                present++;
            } else if (pendingWork.contains(d) || pendingLeave.contains(d)
                    || (week == WeekDecision.PENDING && !rejectedWork.contains(d))) {
                pending++;
            } else if (rejectedWork.contains(d)) {
                rejected++;
            } else if (week == WeekDecision.APPROVED && !rejectedLeave.contains(d)) {
                lopAbsences++;   // 0 hours in an approved week: declared LOP
            } else if (week == WeekDecision.APPROVED) {
                leaveRejectedEmpty++;
            } else if (week == WeekDecision.REJECTED) {
                rejected++;
            } else {
                missing++;   // no timesheet submitted for this week
            }
        }

        int unpaidLeave = 0;   // no unpaid leave type exists in the app
        int review = missing + rejected + leaveRejectedEmpty;
        int lop = unpaidLeave + lopAbsences;
        if (lopAbsences > 0) {
            flags.add(lopAbsences + " working day(s) with 0 hours and no paid leave left, in weeks HR approved: counted as LOP.");
        }
        if (pending > 0) {
            flags.add(pending + " working day(s) waiting for HR to approve a timesheet or leave: not LOP until decided.");
        }
        if (missing > 0) {
            flags.add(missing + " working day(s) with no timesheet submitted: not counted as LOP. Ask the employee to submit.");
        }
        if (rejected > 0) {
            flags.add(rejected + " working day(s) in rejected timesheets: not counted as LOP. HR to decide.");
        }
        if (leaveRejectedEmpty > 0) {
            flags.add(leaveRejectedEmpty + " working day(s) with 0 hours whose leave HR rejected: decide whether it is LOP.");
        }
        if (leaveWithTimesheet > 0) {
            flags.add(leaveWithTimesheet + " day(s) have both approved leave and an approved timesheet: counted once, as leave.");
        }
        if (notYetDue > 0) {
            flags.add("Month not over: " + notYetDue + " working day(s) after today are not counted yet.");
        }
        boolean complete = !provisional && pending == 0 && review == 0;
        return new SalarySummaryResponse.Row(serialNo, e.getId(), e.getEmployeeCode(),
                (e.getFirstName() + " " + e.getLastName()).trim(), e.getEmploymentStatus(), e.getJoiningDate(),
                employed, working, present, paidLeave, unpaidLeave, holidays, weeklyOffs, lopAbsences, pending, review,
                notYetDue, lop, employed - lop, complete, flags);
    }

    private static SalarySummaryResponse.Totals totals(List<SalarySummaryResponse.Row> rows) {
        int present = 0, paid = 0, unpaid = 0, absent = 0, pending = 0, review = 0, lop = 0, payable = 0, needsReview = 0;
        for (SalarySummaryResponse.Row r : rows) {
            present += r.presentDays();
            paid += r.paidLeaveDays();
            unpaid += r.unpaidLeaveDays();
            absent += r.absences();
            pending += r.pendingDays();
            review += r.reviewDays();
            lop += r.lopDays();
            payable += r.payableDays();
            if (!r.complete() || r.absences() > 0 || !r.flags().isEmpty()) {
                needsReview++;
            }
        }
        return new SalarySummaryResponse.Totals(rows.size(), present, paid, unpaid, absent, pending, review, lop, payable,
                needsReview);
    }
}
