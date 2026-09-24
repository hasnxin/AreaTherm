package com.areatherm.api;

/**
 * The standard error envelope every endpoint under {@code /api/v1} uses, per
 * API_SPEC.md's "Conventions" section: {@code {status, error, message, path}}.
 */
public record ApiErrorResponse(int status, String error, String message, String path) {
}
