package com.rightsku.employee_app;

import java.util.Optional;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Rejects a token when its user no longer exists, has been deactivated,
 * or now has a different role than the one written in the token.
 * Without this, a deactivated user could keep using an old token
 * until it expires.
 */
public class ActiveUserJwtValidator implements OAuth2TokenValidator<Jwt> {

    private static final OAuth2Error INVALID = new OAuth2Error(
            OAuth2ErrorCodes.INVALID_TOKEN, "The token is no longer valid", null);

    private final AppUserRepository appUserRepository;

    public ActiveUserJwtValidator(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        // The subject is the internal user ID (see JwtService).
        Long userId;
        try {
            userId = Long.valueOf(jwt.getSubject());
        } catch (NumberFormatException | NullPointerException ex) {
            return OAuth2TokenValidatorResult.failure(INVALID);
        }

        Optional<AppUser> user = appUserRepository.findById(userId);
        boolean valid = user.isPresent()
                && user.get().isActive()
                && user.get().getRole().equals(jwt.getClaimAsString("role"));

        return valid
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(INVALID);
    }
}
