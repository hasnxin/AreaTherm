package com.areatherm.security;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Binds the {@code areatherm.jwt.*} block in application.yml ({@code secret},
 * {@code expiration-minutes}). Kept as a small bean of its own, rather than
 * scattering {@code @Value("${areatherm.jwt...}")} across {@link JwtService}
 * and the auth controller, so both read the identical, already-validated
 * values.
 */
@Component
@ConfigurationProperties(prefix = "areatherm.jwt")
@Getter
@Setter
public class JwtProperties {

    /** HMAC-SHA256 signing secret. Local/dev default lives in application.yml; override via AREATHERM_JWT_SECRET. */
    private String secret;

    /** How long an issued token stays valid. */
    private long expirationMinutes;
}
