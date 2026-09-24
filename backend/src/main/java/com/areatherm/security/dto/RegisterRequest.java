package com.areatherm.security.dto;

import com.areatherm.security.AppUser;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * {@code role} is intentionally unvalidated/nullable -- {@code
 * AppUserService.register} defaults a missing role to
 * {@link AppUser.UserRole#ENGINEER}, matching the {@code app_user.role}
 * column's own default.
 */
public record RegisterRequest(
        @NotBlank @Email String email,
        @NotBlank String displayName,
        @NotBlank String password,
        AppUser.UserRole role
) {
}
