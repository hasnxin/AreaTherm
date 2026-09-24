package com.areatherm.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Optional;
import javax.crypto.SecretKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Issues and validates the HS256 JWTs that back every authenticated
 * {@code /api/v1/**} request. Built on jjwt 0.13.x's key-object API
 * ({@code Jwts.builder()....signWith(SecretKey, MacAlgorithm)}, {@code
 * Jwts.parser().verifyWith(SecretKey)}) -- the raw-string-secret overloads
 * from older jjwt majors are deliberately not used.
 *
 * Claims: subject is the user's email (what {@link AppUserService},
 * a {@link org.springframework.security.core.userdetails.UserDetailsService},
 * looks users up by), plus {@code role} and {@code userId} custom claims so a
 * future caller can read those without a DB round trip.
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    private static final String CLAIM_ROLE = "role";
    private static final String CLAIM_USER_ID = "userId";

    private final JwtProperties jwtProperties;
    private final SecretKey signingKey;

    public JwtService(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
        this.signingKey = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(AppUser user) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(jwtProperties.getExpirationMinutes(), ChronoUnit.MINUTES);

        return Jwts.builder()
                .subject(user.getEmail())
                .claim(CLAIM_ROLE, user.getRole().name())
                .claim(CLAIM_USER_ID, user.getId())
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * @return the token's subject (email) if {@code token} has a valid HS256
     * signature and is not expired; {@link Optional#empty()} for anything
     * else (malformed, expired, wrong signature, blank input) -- callers
     * (the JWT filter) treat all of those identically, as "not authenticated".
     */
    public Optional<String> validateAndGetEmail(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return Optional.ofNullable(claims.getSubject());
        } catch (JwtException | IllegalArgumentException ex) {
            log.debug("Rejected JWT: {}", ex.getMessage());
            return Optional.empty();
        }
    }
}
