package com.rightsku.employee_app;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Forgot password" for people who cannot sign in (public, under /api/auth/**).
 * See {@link PasswordResetService} for the security rules.
 */
@RestController
@RequestMapping("/api/auth/password-reset")
public class PasswordResetController {

    /** The one answer to every code request, whatever the account. */
    static final String SENT_MESSAGE =
            "If this ID belongs to an active account, a 6-digit code has been sent to its registered email. "
                    + "It expires in 15 minutes.";

    private final PasswordResetService resets;

    public PasswordResetController(PasswordResetService resets) {
        this.resets = resets;
    }

    /** Whether reset by email is set up on this server, so the app knows what to show. */
    @GetMapping
    public Map<String, Object> status() {
        return Map.of("emailDelivery", resets.available());
    }

    @PostMapping("/request")
    public ResponseEntity<Map<String, String>> request(@Valid @RequestBody PasswordResetRequest request) {
        resets.request(request.username());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("message", SENT_MESSAGE));
    }

    @PostMapping("/confirm")
    public ResponseEntity<Void> confirm(
            @Valid @RequestBody PasswordResetConfirmRequest request, HttpServletRequest httpRequest) {
        resets.confirm(request, httpRequest.getRemoteAddr());
        return ResponseEntity.noContent().build();
    }
}
