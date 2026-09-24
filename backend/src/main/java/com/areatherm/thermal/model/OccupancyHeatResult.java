package com.areatherm.thermal.model;

/** Mirrors engine.js's computeOccupancyHeat() return object. */
public record OccupancyHeatResult(
    ActivityLevelSpec activity, int persons, double totalW, double sensibleW,
    double latentW, double equipmentW, double totalSensibleW, double latentKgPerHour
) {
}
