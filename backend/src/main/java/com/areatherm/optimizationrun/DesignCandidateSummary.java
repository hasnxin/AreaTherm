package com.areatherm.optimizationrun;

import java.math.BigDecimal;

/**
 * Lightweight per-candidate design summary for {@code GET /optimization-runs/{id}}
 * -- computed in bulk across a whole run's candidates by
 * {@link OptimizationRunService#getDesignSummaries}, never one query per
 * candidate. Plain data (no JPA/DTO framework types), so this package stays
 * independent of the {@code api.dto} response shape the controller maps it
 * into (mirrors how {@code optimization.model.OptimizationResult} hands
 * plain data up to this package, which then adapts it to its own entities).
 */
public record DesignCandidateSummary(
    String wallMaterialSlug,
    String roofMaterialSlug,
    String wallInsulationMaterialSlug,
    BigDecimal wallInsulationThicknessMm,
    String roofInsulationMaterialSlug,
    BigDecimal roofInsulationThicknessMm,
    String glazingMaterialSlug,
    String orientation,
    BigDecimal windowAreaM2,
    Double windowPercentOfWallArea,
    int windowCount,
    BigDecimal thermalMassKg,
    String thermalMassMaterialSlug
) {
}
