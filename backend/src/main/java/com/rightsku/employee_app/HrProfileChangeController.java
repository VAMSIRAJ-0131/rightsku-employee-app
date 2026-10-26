package com.rightsku.employee_app;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * HR: employees' personal details change requests, and an employee's
 * personal details in full. /api/hr/** requires the HR_ADMIN role; the
 * reviewer is taken from the token.
 */
@RestController
@RequestMapping("/api/hr")
public class HrProfileChangeController {

    private final ProfileChangeService changes;

    public HrProfileChangeController(ProfileChangeService changes) {
        this.changes = changes;
    }

    @GetMapping("/profile-changes")
    public List<ProfileChangeResponse> list(@RequestParam(required = false) String status) {
        return changes.withStatus(status);
    }

    @GetMapping("/profile-changes/count")
    public Map<String, Long> count() {
        return Map.of("pending", changes.pendingCount());
    }

    @PostMapping("/profile-changes/{id}/approve")
    public ProfileChangeResponse approve(
            @PathVariable long id, @Valid @RequestBody(required = false) ReviewNoteRequest body, @AuthenticationPrincipal Jwt jwt) {
        return changes.approve(id, body == null ? null : body.note(), Long.valueOf(jwt.getSubject()));
    }

    @PostMapping("/profile-changes/{id}/reject")
    public ProfileChangeResponse reject(
            @PathVariable long id, @Valid @RequestBody(required = false) ReviewNoteRequest body, @AuthenticationPrincipal Jwt jwt) {
        return changes.reject(id, body == null ? null : body.note(), Long.valueOf(jwt.getSubject()));
    }

    @GetMapping("/employees/{employeeId}/personal-details")
    public PersonalDetailsResponse details(@PathVariable long employeeId) {
        return changes.detailsFor(employeeId);
    }
}
