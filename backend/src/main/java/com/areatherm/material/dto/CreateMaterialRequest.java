package com.areatherm.material.dto;

import com.areatherm.material.Material;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/**
 * {@code isCustom}/{@code isEngineeringDbValue} are deliberately not fields
 * here -- per API_SPEC.md, a POSTed material is always marked
 * {@code isCustom: true, isEngineeringDbValue: false} server-side, so client
 * input for those two flags is never even accepted, let alone trusted.
 */
public record CreateMaterialRequest(
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
