package com.rightsku.employee_app;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in employee's personal details and their requests to change
 * them. /api/employee/** requires the EMPLOYEE role; the employee is always
 * taken from the token. Nothing is changed until HR approves.
 */
@RestController
@RequestMapping("/api/employee/profile-changes")
public class EmployeeProfileChangeController {

    private final ProfileChangeService changes;

    public EmployeeProfileChangeController(ProfileChangeService changes) {
        this.changes = changes;
    }

    @GetMapping("/details")
    public PersonalDetailsResponse details(@AuthenticationPrincipal Jwt jwt) {
        return changes.myDetails(userId(jwt));
    }

    @GetMapping
    public List<ProfileChangeResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return changes.mine(userId(jwt));
    }

    /** Body: {"changes": {"phone": "...", "bankIfsc": "..."}}; an empty value removes the detail. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProfileChangeResponse ask(@RequestBody AskRequest body, @AuthenticationPrincipal Jwt jwt) {
        return changes.ask(userId(jwt), body == null ? null : body.changes());
    }

    @PostMapping("/{id}/cancel")
    public ProfileChangeResponse cancel(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return changes.cancel(userId(jwt), id);
    }

    public record AskRequest(Map<String, String> changes) {
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
