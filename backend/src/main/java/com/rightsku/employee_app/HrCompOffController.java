package com.rightsku.employee_app;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * HR: an employee's Comp-Off balance and history, and manual changes to it.
 * /api/hr/** requires the HR_ADMIN role (see SecurityConfig), so employees can
 * never change a balance; the person making a change is taken from the token.
 */
@RestController
@RequestMapping("/api/hr/employees/{employeeId}/comp-off")
public class HrCompOffController {

    private final CompOffService compOff;

    public HrCompOffController(CompOffService compOff) {
        this.compOff = compOff;
    }

    @GetMapping
    public CompOffResponse summary(@PathVariable long employeeId) {
        return compOff.summary(employeeId);
    }

    @PostMapping("/adjustments")
    public CompOffResponse adjust(
            @PathVariable long employeeId,
            @Valid @RequestBody CompOffAdjustmentRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return compOff.adjust(employeeId, request, Long.valueOf(jwt.getSubject()));
    }
}
