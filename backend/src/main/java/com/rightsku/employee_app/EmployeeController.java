package com.rightsku.employee_app;

import java.net.URI;

import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
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
 * Employee management API. Everything under /api/hr/** requires the HR_ADMIN
 * role (see SecurityConfig): employees get 403, unauthenticated requests 401.
 */
@RestController
@RequestMapping("/api/hr/employees")
public class EmployeeController {

    private final EmployeeService employeeService;

    public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    /** Search and filter: q matches name, Employee ID, email, department or job title. */
    @GetMapping
    public EmployeePageResponse list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "ALL") String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return employeeService.list(q, status, page, size);
    }

    @GetMapping("/{id}")
    public EmployeeResponse get(@PathVariable long id) {
        return employeeService.get(id);
    }

    @PostMapping
    public ResponseEntity<EmployeeResponse> create(
            @Valid @RequestBody CreateEmployeeRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        EmployeeResponse created = employeeService.create(request, actorId(jwt));
        return ResponseEntity.created(URI.create("/api/hr/employees/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    public EmployeeResponse update(
            @PathVariable long id,
            @Valid @RequestBody UpdateEmployeeRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return employeeService.update(id, request, actorId(jwt));
    }

    @PostMapping("/{id}/activate")
    public EmployeeResponse activate(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return employeeService.setActive(id, true, actorId(jwt));
    }

    @PostMapping("/{id}/deactivate")
    public EmployeeResponse deactivate(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return employeeService.setActive(id, false, actorId(jwt));
    }

    /**
     * Resets a forgotten password to a temporary one chosen by HR (204, no
     * body: the password is never sent back). The employee must change it at
     * the next sign-in, and their existing sessions end.
     */
    @PostMapping("/{id}/reset-password")
    public ResponseEntity<Void> resetPassword(
            @PathVariable long id,
            @Valid @RequestBody HrPasswordResetRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        employeeService.resetPassword(id, request, actorId(jwt));
        return ResponseEntity.noContent().build();
    }

    /** The signed-in HR Admin's user ID (the token subject), for the audit log. */
    private static Long actorId(Jwt jwt) {
        return jwt == null ? null : Long.valueOf(jwt.getSubject());
    }
}
