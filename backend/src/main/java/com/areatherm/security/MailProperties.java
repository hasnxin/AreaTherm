package com.areatherm.security;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Binds the {@code areatherm.mail.*} block in application.yml ({@code from},
 * {@code verification-code-expiry-minutes}). The actual SMTP transport
 * settings ({@code spring.mail.*} — host/port/username/password) are bound
 * separately by Spring Boot's own auto-configuration; this only covers the
 * AreaTherm-specific values {@link EmailService}/{@link AppUserService} need.
 */
@Component
@ConfigurationProperties(prefix = "areatherm.mail")
@Getter
@Setter
public class MailProperties {

    /** "From" address on outgoing mail — normally the same account as spring.mail.username. */
    private String from;

    /** How long a freshly issued verification code stays valid. */
    private long verificationCodeExpiryMinutes;
}
