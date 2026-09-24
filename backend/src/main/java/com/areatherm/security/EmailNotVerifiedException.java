package com.areatherm.security;

/**
 * Thrown by {@code AuthController.login} when the account's credentials are
 * correct but {@link AppUser#isEmailVerified()} is still false. Translated
 * to a 403 by {@link com.areatherm.api.ApiExceptionHandler}.
 */
public class EmailNotVerifiedException extends RuntimeException {

    public EmailNotVerifiedException() {
        super("Please verify your email before signing in");
    }
}
