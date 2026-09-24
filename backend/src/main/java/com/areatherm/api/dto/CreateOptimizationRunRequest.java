package com.areatherm.api.dto;

import jakarta.validation.constraints.NotNull;

public record CreateOptimizationRunRequest(
    @NotNull Long projectId,
    @NotNull Long baseShelterDesignId,
    @NotNull Long climateProfileId,
    int timeStepMinutes,
    String periodType, // defaults to "24H" if blank
    WeightsRequest weights,
    boolean broaderSearch
) {
    public record WeightsRequest(double comfort, double retention, double solar, double energy, double cost) {
    }
}
