package com.areatherm.security;

/**
 * Thrown by {@link AppUserService#register} when the requested email is
 * already taken -- checked explicitly (rather than letting the {@code
 * app_user.email} unique constraint's {@code DataIntegrityViolationException}
 * bubble up raw) so {@link com.areatherm.api.ApiExceptionHandler} can report
 * a clean 409 with API_SPEC.md's standard error envelope. Translated there,
 * the same way {@link com.areatherm.api.ResourceNotFoundException} is.
 */
public class EmailAlreadyRegisteredException extends RuntimeException {

    public EmailAlreadyRegisteredException(String email) {
        super("Email already registered: " + email);
    }

    public EmailAlreadyRegisteredException(String email, Throwable cause) {
        super("Email already registered: " + email, cause);
    }
}
