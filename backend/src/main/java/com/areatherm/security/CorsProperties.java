package com.areatherm.security;

import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Binds the {@code areatherm.cors.*} block in application.yml ({@code
 * allowed-origins}) -- the browser origin(s) permitted to call this API
 * cross-origin, e.g. the separately-hosted frontend. Kept as a small bean of
 * its own, matching {@link JwtProperties}'s pattern, rather than a bare
 * {@code @Value("${areatherm.cors...}")} in {@link SecurityConfig}.
 */
@Component
@ConfigurationProperties(prefix = "areatherm.cors")
@Getter
@Setter
public class CorsProperties {

    /** Origins allowed to make cross-origin requests to this API (browser CORS). */
    private List<String> allowedOrigins;
}
