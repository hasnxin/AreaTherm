package com.areatherm.api.dto;

import com.areatherm.optimizationrun.DesignCandidate;
import com.areatherm.optimizationrun.DesignCandidateSummary;

import java.math.BigDecimal;

public record DesignCandidateResponse(
    Long id, String label, Long shelterDesignId, Long simulationId,
    BigDecimal comfortScore, BigDecimal retentionScore, BigDecimal solarScore,
    BigDecimal energyScore, BigDecimal costScore, BigDecimal weightedTotalScore,
    BigDecimal estimatedCostInr, boolean isRecommended,
    DesignSummary designSummary
) {
    public static DesignCandidateResponse from(DesignCandidate c) {
        return from(c, null);
    }

    /** designSummary may be null (e.g. lookup miss); the response field is simply omitted then. */
    public static DesignCandidateResponse from(DesignCandidate c, DesignCandidateSummary summary) {
        return new DesignCandidateResponse(
            c.getId(), c.getLabel(), c.getShelterDesign().getId(),
            c.getSimulation() != null ? c.getSimulation().getId() : null,
            c.getComfortScore(), c.getRetentionScore(), c.getSolarScore(),
            c.getEnergyScore(), c.getCostScore(), c.getWeightedTotalScore(),
            c.getEstimatedCostInr(), c.isRecommended(),
            DesignSummary.from(summary)
        );
    }

    /**
     * Lightweight design-summary fields for a candidate -- material slugs
     * for wall/roof/insulation/glazing, orientation, insulation thickness,
     * window area/percentage of wall area, and thermal mass kg if present.
     * See {@link DesignCandidateSummary} (computed in bulk, not per
     * candidate) for how this is populated.
     */
    public record DesignSummary(
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
        public static DesignSummary from(DesignCandidateSummary s) {
            if (s == null) {
                return null;
            }
            return new DesignSummary(
                s.wallMaterialSlug(), s.roofMaterialSlug(),
                s.wallInsulationMaterialSlug(), s.wallInsulationThicknessMm(),
                s.roofInsulationMaterialSlug(), s.roofInsulationThicknessMm(),
                s.glazingMaterialSlug(), s.orientation(),
                s.windowAreaM2(), s.windowPercentOfWallArea(), s.windowCount(),
                s.thermalMassKg(), s.thermalMassMaterialSlug()
            );
        }
    }
}
