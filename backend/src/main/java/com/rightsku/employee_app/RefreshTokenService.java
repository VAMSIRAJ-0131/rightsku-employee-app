package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "Stay signed in" for the phone app. A refresh token is 256 random bits,
 * returned once at sign-in and kept encrypted on the phone; the database only
 * has its SHA-256 hash. Each use extends it by the full lifetime, so a phone
 * that opens the app now and then stays signed in until the person logs out.
 *
 * It no longer works after Log out, after a password change or HR password
 * reset (the account's session version moves on), when the account is
 * deactivated, or when it has not been used for the whole lifetime.
 */
@Service
public class RefreshTokenService {

    /** Longest value accepted from a client: a real token is 43 characters. */
    static final int MAX_TOKEN_LENGTH = 100;

    private final RefreshTokenRepository tokens;
    private final AppUserRepository users;
    private final Clock clock;
    private final Duration lifetime;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(
            RefreshTokenRepository tokens,
            AppUserRepository users,
            Clock clock,
            @Value("${app.refresh-token.lifetime:180d}") Duration lifetime) {
        if (lifetime == null || lifetime.isZero() || lifetime.isNegative()) {
            throw new IllegalStateException("app.refresh-token.lifetime must be a positive duration.");
        }
        this.tokens = tokens;
        this.users = users;
        this.clock = clock;
        this.lifetime = lifetime;
    }

    /** A new refresh token for this phone. The raw value is returned once and never stored. */
    @Transactional
    public String issue(AppUser user) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = clock.instant();
        tokens.save(RefreshToken.issue(user.getId(), hash(raw), user.getSessionVersion(), now, now.plus(lifetime)));
        return raw;
    }

    /**
     * The account a still-valid refresh token belongs to, with the token's
     * life extended; empty when it is unknown, logged out, expired, issued
     * before a password change, or the account is inactive. A token that can
     * no longer work is revoked on the way.
     */
    @Transactional
    public Optional<AppUser> use(String raw) {
        if (raw == null || raw.isBlank() || raw.length() > MAX_TOKEN_LENGTH) {
            return Optional.empty();
        }
        Optional<RefreshToken> found = tokens.findByTokenHash(hash(raw));
        if (found.isEmpty()) {
            return Optional.empty();
        }
        RefreshToken token = found.get();
        Instant now = clock.instant();
        if (!token.usableAt(now)) {
            token.revoke(now);
            return Optional.empty();
        }
        Optional<AppUser> user = users.findById(token.getUserId())
                .filter(AppUser::isActive)
                .filter(u -> u.getSessionVersion() == token.getSessionVersion());
        if (user.isEmpty()) {
            token.revoke(now);
            return Optional.empty();
        }
        token.use(now, now.plus(lifetime));
        return user;
    }

    /** Log out on this phone. Unknown or already revoked tokens are ignored. */
    @Transactional
    public void revoke(String raw) {
        if (raw == null || raw.isBlank() || raw.length() > MAX_TOKEN_LENGTH) {
            return;
        }
        tokens.findByTokenHash(hash(raw)).ifPresent(t -> t.revoke(clock.instant()));
    }

    static String hash(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
