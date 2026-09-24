package com.areatherm.security.dto;

/** Returned by {@code POST /api/v1/auth/login} on success. */
public record AuthResponse(
        String token,
        String tokenType,
        long expiresInMinutes
) {
}
