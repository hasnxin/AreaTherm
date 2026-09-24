package com.areatherm.material.dto;

import com.areatherm.material.Material;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/**
 * {@code PUT /materials/{id}}: per API_SPEC.md, "engineering DB values are
 * configurable, not hard-coded" -- so this works on any material, not just
 * custom ones. Like {@link CreateMaterialRequest}, {@code isCustom}/
 * {@code isEngineeringDbValue} are intentionally absent: they are provenance
 * flags describing where a row came from, not data fields, and stay
 * whatever they already were on the stored row.
 */
public record UpdateMaterialRequest(
        @NotBlank String slug,
        @NotNull Material.MaterialCategory category,
        @NotBlank String name,
        BigDecimal densityKgM3,
        BigDecimal thermalConductivityWMk,
        BigDecimal specificHeatJKgK,
        BigDecimal defaultThicknessMm,
        BigDecimal uValueWM2k,
        BigDecimal solarAbsorptivity,
        BigDecimal solarReflectivity,
        BigDecimal emissivity,
        BigDecimal shgc,
        BigDecimal pcmMeltTempC,
        BigDecimal pcmLatentHeatJKg,
        String moistureNotes,
        BigDecimal costEstimateInrPerUnit,
        Material.SustainabilityIndicator sustainabilityIndicator,
        String version
) {
}
