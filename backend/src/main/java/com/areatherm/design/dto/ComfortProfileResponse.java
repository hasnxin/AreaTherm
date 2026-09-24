package com.areatherm.design.dto;

import com.areatherm.design.ComfortProfile;

import java.math.BigDecimal;

public record ComfortProfileResponse(
        Long id,
        Long projectId,
        ComfortProfile.ProfileType profileType,
        String name,
        BigDecimal comfortMinC,
        BigDecimal comfortMaxC,
        String notes
) {

    public static ComfortProfileResponse from(ComfortProfile profile) {
        return new ComfortProfileResponse(
                profile.getId(),
                profile.getProject().getId(),
                profile.getProfileType(),
                profile.getName(),
                profile.getComfortMinC(),
                profile.getComfortMaxC(),
                profile.getNotes()
        );
    }
}
