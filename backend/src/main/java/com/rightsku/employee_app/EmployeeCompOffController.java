package com.rightsku.employee_app;

import jakarta.validation.Valid;
import java.util.List;

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
 * The signed-in employee's Comp-Off requests (for work on a weekly off or
 * company holiday). /api/employee/** requires the EMPLOYEE role; the employee
 * is always taken from the token, and only HR can approve or credit.
 */
@RestController
@RequestMapping("/api/employee/comp-off-requests")
public class EmployeeCompOffController {

    private final CompOffRequestService compOff;

    public EmployeeCompOffController(CompOffRequestService compOff) {
        this.compOff = compOff;
    }

    @GetMapping
    public List<CompOffRequestResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return compOff.mine(userId(jwt));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CompOffRequestResponse apply(@Valid @RequestBody CompOffApplyRequest request, @AuthenticationPrincipal Jwt jwt) {
        return compOff.apply(userId(jwt), request);
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
