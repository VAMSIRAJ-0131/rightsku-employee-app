package com.rightsku.employee_app;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Clock;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The phone app registers its push token here after sign-in (PUT) and removes
 * it at Log out (DELETE). Always for the signed-in account from the token,
 * never an account named in the request.
 */
@RestController
@RequestMapping("/api/push/token")
public class PushTokenController {

    /** Body of both calls. */
    public record PushTokenRequest(
            @NotBlank(message = "Push token is required")
            @Size(max = 4096, message = "Push token is too long")
            String token) {
    }

    private final PushTokenRepository tokens;
    private final Clock clock;

    public PushTokenController(PushTokenRepository tokens, Clock clock) {
        this.tokens = tokens;
        this.clock = clock;
    }

    @PutMapping
    @Transactional
    public ResponseEntity<Void> register(@Valid @RequestBody PushTokenRequest request, @AuthenticationPrincipal Jwt jwt) {
        long userId = Long.parseLong(jwt.getSubject());
        String token = request.token().trim();
        tokens.findByToken(token).ifPresentOrElse(
                t -> t.seen(userId, clock.instant()),
                () -> tokens.save(PushToken.register(userId, token, "android", clock.instant())));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<Void> remove(@Valid @RequestBody PushTokenRequest request, @AuthenticationPrincipal Jwt jwt) {
        tokens.deleteOwn(request.token().trim(), Long.parseLong(jwt.getSubject()));
        return ResponseEntity.noContent().build();
    }
}
