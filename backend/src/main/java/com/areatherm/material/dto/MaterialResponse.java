package com.areatherm.material.dto;

import com.areatherm.material.Material;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * Full material record -- every field {@link Material} has. Deliberately
 * not a slimmed-down projection: the frontend needs the complete engineering
 * record (density, k, cp, PCM params, cost, ...), not just display fields.
 */
public record MaterialResponse(
        Long id,
        String slug,
        Material.MaterialCategory category,
        String name,
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
        @JsonProperty("isCustom") boolean custom,
        @JsonProperty("isEngineeringDbValue") boolean engineeringDbValue,
        String version
) {

    public static MaterialResponse from(Material m) {
        return new MaterialResponse(
                m.getId(),
                m.getSlug(),
                m.getCategory(),
                m.getName(),
                m.getDensityKgM3(),
                m.getThermalConductivityWMk(),
                m.getSpecificHeatJKgK(),
                m.getDefaultThicknessMm(),
                m.getUValueWM2k(),
                m.getSolarAbsorptivity(),
                m.getSolarReflectivity(),
                m.getEmissivity(),
                m.getShgc(),
                m.getPcmMeltTempC(),
                m.getPcmLatentHeatJKg(),
                m.getMoistureNotes(),
                m.getCostEstimateInrPerUnit(),
                m.getSustainabilityIndicator(),
                m.isCustom(),
                m.isEngineeringDbValue(),
                m.getVersion()
        );
    }
}
