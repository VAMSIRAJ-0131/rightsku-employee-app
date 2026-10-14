package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

@Service
public class JwtService {

    public static final String ISSUER = "rightsku-employee-app";

    /** HS256 needs a key of at least 256 bits (32 bytes). */
    static final int MIN_SECRET_BYTES = 32;

    private final SecretKey secretKey;
    private final JwtEncoder jwtEncoder;
    private final Duration expiration;
    private final Clock clock;

    @Autowired
    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration:8h}") Duration expiration) {
        this(secret, expiration, Clock.systemUTC());
    }

    /** Also used by tests to create tokens at a fixed point in time. */
    JwtService(String secret, Duration expiration, Clock clock) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET is not set. Set it as an environment variable.");
        }
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < MIN_SECRET_BYTES) {
            // Never include the secret itself in the message.
            throw new IllegalStateException(
                    "JWT_SECRET is too short. Use at least " + MIN_SECRET_BYTES
                            + " random bytes (for example a 64-character random string).");
        }
        if (expiration == null || expiration.isZero() || expiration.isNegative()) {
            throw new IllegalStateException("app.jwt.expiration must be a positive duration.");
        }

        this.secretKey = new SecretKeySpec(keyBytes, "HmacSHA256");
        this.jwtEncoder = new NimbusJwtEncoder(new ImmutableSecret<>(secretKey));
        this.expiration = expiration;
        this.clock = clock;
    }

    public String generateToken(AppUser user) {
        Instant now = clock.instant();

        // Subject is the internal user ID: it never changes, unlike email or Employee ID.
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .issuedAt(now)
                .expiresAt(now.plus(expiration))
                .subject(String.valueOf(user.getId()))
                .claim("userId", user.getId())
                .claim("role", user.getRole());
        if (user.getLoginId() != null) {
            claims.claim("loginId", user.getLoginId());
        }

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();

        return jwtEncoder.encode(
                JwtEncoderParameters.from(header, claims.build()))
                .getTokenValue();
    }

    public Duration getExpiration() {
        return expiration;
    }

    /**
     * Decoder that checks the signature (HS256 only), expiry / not-before
     * (with Spring's default 60 second clock skew) and the issuer, plus any
     * extra validators supplied by the caller.
     */
    @SafeVarargs
    public final NimbusJwtDecoder jwtDecoderFromConfiguredSecret(
            OAuth2TokenValidator<Jwt>... additionalValidators) {

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(secretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();

        List<OAuth2TokenValidator<Jwt>> validators = new ArrayList<>();
        validators.add(JwtValidators.createDefaultWithIssuer(ISSUER));
        validators.addAll(List.of(additionalValidators));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(validators));
        return decoder;
    }
}
