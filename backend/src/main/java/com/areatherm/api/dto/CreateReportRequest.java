package com.areatherm.api.dto;

import jakarta.validation.constraints.NotNull;

public record CreateReportRequest(@NotNull Long projectId, Long simulationId, Long optimizationRunId, Long generatedByUserId) {
}
