package com.areatherm.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Sends the two AreaTherm account emails (a registration verification code,
 * a login notification) via SMTP ({@code spring.mail.*} — see
 * application.yml). Both methods run on their own executor
 * ({@link com.areatherm.config.AsyncConfig#mailTaskExecutor}), separate from
 * the simulation/optimization job pool, and both swallow any send failure
 * after logging it -- a misconfigured or unreachable mail server must never
 * break registration/login/verification, only leave a trace in the server
 * log for {@code /auth/resend-verification} to retry against later.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final JavaMailSender mailSender;
    private final MailProperties mailProperties;

    public EmailService(JavaMailSender mailSender, MailProperties mailProperties) {
        this.mailSender = mailSender;
        this.mailProperties = mailProperties;
    }

    @Async("mailTaskExecutor")
    public void sendVerificationCodeAsync(String toEmail, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailProperties.getFrom());
        message.setTo(toEmail);
        message.setSubject("Verify your AreaTherm account");
        message.setText(
            "Your AreaTherm verification code is: " + code + "\n\n" +
            "It expires in " + mailProperties.getVerificationCodeExpiryMinutes() + " minutes.\n\n" +
            "If you didn't request this, you can ignore this email."
        );
        send(message, toEmail, "verification code");
    }

    @Async("mailTaskExecutor")
    public void sendLoginNotificationAsync(String toEmail) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailProperties.getFrom());
        message.setTo(toEmail);
        message.setSubject("New sign-in to your AreaTherm account");
        message.setText(
            "Your AreaTherm account (" + toEmail + ") just signed in, at " +
            LocalDateTime.now().format(TIMESTAMP_FORMAT) + "."
        );
        send(message, toEmail, "login notification");
    }

    private void send(SimpleMailMessage message, String toEmail, String kind) {
        try {
            mailSender.send(message);
        } catch (MailException e) {
            log.warn("Could not send {} email to {}: {}", kind, toEmail, e.getMessage());
        }
    }
}
