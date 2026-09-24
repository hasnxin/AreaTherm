package com.areatherm.security.dto;

import com.areatherm.security.AppUser;

/** Never includes {@code passwordHash} -- see {@link AppUser}. */
public record UserResponse(
        Long id,
        String email,
        String displayName,
        AppUser.UserRole role
) {

    public static UserResponse from(AppUser user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole());
    }
}
