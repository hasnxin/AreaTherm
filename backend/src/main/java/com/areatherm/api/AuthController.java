package com.areatherm.api;

import com.areatherm.security.AppUser;
import com.areatherm.security.AppUserService;
import com.areatherm.security.EmailNotVerifiedException;
import com.areatherm.security.EmailService;
import com.areatherm.security.JwtProperties;
import com.areatherm.security.JwtService;
import com.areatherm.security.dto.AuthResponse;
import com.areatherm.security.dto.LoginRequest;
import com.areatherm.security.dto.RegisterRequest;
import com.areatherm.security.dto.ResendVerificationRequest;
import com.areatherm.security.dto.UserResponse;
import com.areatherm.security.dto.VerifyEmailRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The only {@code /api/v1/**} endpoints {@link com.areatherm.security.SecurityConfig}
 * leaves open to anonymous callers -- see its {@code PUBLIC_PATHS}. Every
 * other controller in this package now needs a bearer token obtained from
 * {@link #login} or {@link #verifyEmail}.
 */
@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth")
public class AuthController {

    private final AppUserService appUserService;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final JwtProperties jwtProperties;
    private final EmailService emailService;

    public AuthController(AppUserService appUserService, JwtService jwtService,
                           PasswordEncoder passwordEncoder, JwtProperties jwtProperties,
                           EmailService emailService) {
        this.appUserService = appUserService;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.jwtProperties = jwtProperties;
        this.emailService = emailService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a new user", description = "role defaults to ENGINEER when omitted. Sends a verification code by email; the account cannot log in until verified via /verify-email.")
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        AppUser user = appUserService.register(request.email(), request.displayName(), request.password(), request.role());
        return UserResponse.from(user);
    }

    @PostMapping("/login")
    @Operation(summary = "Exchange email + password for a bearer JWT", description = "403 if the account hasn't verified its email yet.")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        AppUser user = appUserService.findByEmail(request.email())
                .filter(candidate -> passwordEncoder.matches(request.password(), candidate.getPasswordHash()))
                .orElseThrow(() -> new BadCredentialsException("Invalid email or password"));
        if (!user.isEmailVerified()) {
            throw new EmailNotVerifiedException();
        }

        String token = jwtService.generateToken(user);
        emailService.sendLoginNotificationAsync(user.getEmail());
        return new AuthResponse(token, "Bearer", jwtProperties.getExpirationMinutes());
    }

    @PostMapping("/verify-email")
    @Operation(summary = "Submit a registration verification code", description = "Returns a bearer JWT on success, same shape as /login -- verifying logs you in.")
    public AuthResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        AppUser user = appUserService.verifyEmail(request.email(), request.code());
        String token = jwtService.generateToken(user);
        return new AuthResponse(token, "Bearer", jwtProperties.getExpirationMinutes());
    }

    @PostMapping("/resend-verification")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Resend a fresh verification code", description = "Always responds 204, whether or not the email is registered -- never reveals account existence.")
    public void resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        appUserService.resendVerificationCode(request.email());
    }
}
