package com.rightsku.employee_app;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in employee's leave: balances (read only) and requests.
 * /api/employee/** requires the EMPLOYEE role; the employee is always taken
 * from the token, so nobody can read or change another employee's leave, and
 * there is no way for an employee to change a balance.
 */
@RestController
@RequestMapping("/api/employee/leave")
public class EmployeeLeaveController {

    private final LeaveService leave;

    public EmployeeLeaveController(LeaveService leave) {
        this.leave = leave;
    }

    @GetMapping("/balances")
    public List<LeaveBalanceResponse> balances(@AuthenticationPrincipal Jwt jwt) {
        return leave.myBalances(userId(jwt));
    }

    @GetMapping("/requests")
    public List<LeaveRequestResponse> requests(@AuthenticationPrincipal Jwt jwt) {
        return leave.myRequests(userId(jwt));
    }

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    public LeaveRequestResponse apply(@Valid @RequestBody LeaveApplyRequest request, @AuthenticationPrincipal Jwt jwt) {
        return leave.apply(userId(jwt), request);
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
