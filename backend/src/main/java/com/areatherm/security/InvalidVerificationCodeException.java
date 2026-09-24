package com.areatherm.security;

/**
 * Thrown by {@link AppUserService#verifyEmail} for an unknown email, a
 * wrong code, or an expired one -- deliberately one exception/message for
 * all three (never reveals which). Translated to a 400 by
 * {@link com.areatherm.api.ApiExceptionHandler}.
 */
public class InvalidVerificationCodeException extends RuntimeException {

    public InvalidVerificationCodeException() {
        super("Invalid or expired verification code");
    }
}
