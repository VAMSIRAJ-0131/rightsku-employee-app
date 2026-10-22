package com.rightsku.employee_app;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * HR: timesheet and leave approvals, approval counts, and leave balances.
 * /api/hr/** requires the HR_ADMIN role (see SecurityConfig); the reviewer is
 * always taken from the token.
 */
@RestController
@RequestMapping("/api/hr")
public class HrApprovalController {

    private final HrTimesheetService timesheets;
    private final LeaveService leave;

    public HrApprovalController(HrTimesheetService timesheets, LeaveService leave) {
        this.timesheets = timesheets;
        this.leave = leave;
    }

    /** Pending, approved and rejected counts for the home screen and Approvals tabs. */
    @GetMapping("/approvals/summary")
    public ApprovalSummaryResponse summary() {
        return timesheets.summary();
    }

    /** Timesheet weeks with this status (default PENDING), one row per employee and week. */
    @GetMapping("/timesheets")
    public List<HrTimesheetWeekResponse> timesheetWeeks(@RequestParam(required = false) String status) {
        return timesheets.weeks(status);
    }

    /** Approve or reject the pending days of one employee's week. */
    @PostMapping("/timesheets/review")
    public HrTimesheetWeekResponse reviewTimesheetWeek(
            @Valid @RequestBody TimesheetReviewRequest request, @AuthenticationPrincipal Jwt jwt) {
        return timesheets.review(request, actorId(jwt));
    }

    @GetMapping("/leave-requests")
    public List<LeaveRequestResponse> leaveRequests(@RequestParam(required = false) String status) {
        return leave.requestsWithStatus(status);
    }

    @PostMapping("/leave-requests/{id}/approve")
    public LeaveRequestResponse approveLeave(
            @PathVariable long id, @Valid @RequestBody(required = false) ReviewNoteRequest body, @AuthenticationPrincipal Jwt jwt) {
        return leave.approve(id, body == null ? null : body.note(), actorId(jwt));
    }

    @PostMapping("/leave-requests/{id}/reject")
    public LeaveRequestResponse rejectLeave(
            @PathVariable long id, @Valid @RequestBody(required = false) ReviewNoteRequest body, @AuthenticationPrincipal Jwt jwt) {
        return leave.reject(id, body == null ? null : body.note(), actorId(jwt));
    }

    @GetMapping("/employees/{employeeId}/leave-balances")
    public List<LeaveBalanceResponse> leaveBalances(@PathVariable long employeeId) {
        return leave.balancesOf(employeeId);
    }

    @PutMapping("/employees/{employeeId}/leave-balances/{leaveType}")
    public List<LeaveBalanceResponse> setLeaveBalance(
            @PathVariable long employeeId,
            @PathVariable String leaveType,
            @Valid @RequestBody LeaveBalanceRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return leave.setBalance(employeeId, leaveType, request.balanceDays(), actorId(jwt));
    }

    private static Long actorId(Jwt jwt) {
        return jwt == null ? null : Long.valueOf(jwt.getSubject());
    }
}
