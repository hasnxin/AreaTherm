package com.areatherm.design.dto;

import com.areatherm.design.ComfortProfile;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record CreateComfortProfileRequest(
        @NotNull Long projectId,
        @NotNull ComfortProfile.ProfileType profileType,
        @NotBlank String name,
        @NotNull BigDecimal comfortMinC,
        @NotNull BigDecimal comfortMaxC,
        String notes
) {
}
