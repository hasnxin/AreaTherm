package com.areatherm.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record CreateShelterDesignRequest(
    @NotNull Long projectId,
    @NotBlank String name,
    @NotBlank String shape, // RECTANGULAR | SQUARE | CIRCULAR | DOME | SEMI_CIRCULAR | L_SHAPE | CUSTOM
    Double length, Double width, Double height, Double diameter,
    Double lengthA, Double widthA, Double lengthB, Double widthB,
    @NotBlank String orientation, // NORTH | SOUTH | EAST | WEST | NE | NW | SE | SW | CUSTOM
    Double azimuthDeg,
    @NotNull Long wallMaterialId, @NotNull Double wallThicknessMm,
    @NotNull Long roofMaterialId, @NotNull Double roofThicknessMm,
    @NotNull Long floorMaterialId, Double floorThicknessMm,
    Long wallInsulationMaterialId, Double wallInsulationThicknessMm,
    Long roofInsulationMaterialId, Double roofInsulationThicknessMm,
    Double airLeakageAch,
    @NotNull Long comfortProfileId,
    Integer occupancyCount,
    String occupancyActivity, // SLEEPING | SEATED | LIGHT | MODERATE | HEAVY
    Double internalHeatGainW,
    Double groundTempC,
    List<OpeningRequest> windows,
    List<OpeningRequest> doors,
    ThermalMassRequest thermalMass,
    // Optional hour-indexed alternative to occupancyCount/occupancyActivity
    // above -- list index IS the hour of day (0-23), so this must be either
    // null/absent (use the flat pair for the whole run) or exactly 24
    // entries long, never partial.
    List<ScheduleHourRequest> occupancySchedule
) {
    public record OpeningRequest(double areaEach, int count, @NotBlank String orientation, Long glazingMaterialId) {
    }

    public record ThermalMassRequest(@NotNull Long materialId, double massKg, double surfaceAreaM2, String exposure) {
    }

    public record ScheduleHourRequest(int occupancyCount, @NotBlank String occupancyActivity) {
    }
}
