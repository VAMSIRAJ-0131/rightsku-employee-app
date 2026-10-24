package com.rightsku.employee_app;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

/**
 * The timesheet's view of leave: every day of the employee's leave requests
 * between two dates, with the request's status. The weekly target uses only
 * the APPROVED ones (see {@link WeekTarget}). Requests are whole days.
 */
@Component
public class LeaveRequestLeaveDays implements LeaveDays {

    private final LeaveRequestRepository requests;

    public LeaveRequestLeaveDays(LeaveRequestRepository requests) {
        this.requests = requests;
    }

    @Override
    public List<LeaveDay> leaveBetween(long employeeId, LocalDate from, LocalDate to) {
        List<LeaveDay> days = new ArrayList<>();
        for (LeaveRequest r : requests.touching(employeeId, from, to)) {
            Status status = Status.valueOf(r.getStatus());
            LocalDate first = r.getStartDate().isBefore(from) ? from : r.getStartDate();
            LocalDate last = r.getEndDate().isAfter(to) ? to : r.getEndDate();
            for (LocalDate d = first; !d.isAfter(last); d = d.plusDays(1)) {
                days.add(new LeaveDay(d, Portion.FULL_DAY, status, r.getLeaveType()));
            }
        }
        return days;
    }
}
