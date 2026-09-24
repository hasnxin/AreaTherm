package com.areatherm.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;

public record CreateSimulationRequest(
    @NotNull Long projectId,
    @NotNull Long shelterDesignId,
    @NotNull Long climateProfileId,
    int timeStepMinutes,
    @NotBlank String periodType, // "24H" | "7D" | "30D" | "SEASONAL" | "CUSTOM"
    @NotNull LocalDateTime startAt,
    @NotNull LocalDateTime endAt,
    Long runByUserId
) {
}
