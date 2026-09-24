package com.areatherm.climate.dto;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record CreateLocationRequest(
        @NotNull Long projectId,
        String country,
        String state,
        String district,
        String village,
        @NotNull BigDecimal latitude,
        @NotNull BigDecimal longitude,
        BigDecimal elevationM
) {
}
