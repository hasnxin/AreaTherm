package com.areatherm.thermal.model;

import java.util.List;

/** Faithful mirror of engine.js's runSimulation() return object -- field names and nesting kept 1:1. */
public record SimulationResult(
    Geometry geometry,
    UValues uValues,
    double netWallArea, double windowArea, double doorArea,
    List<SeriesPoint> series,
    Ach ach,
    OccupancyResult occupancy,
    DailyResult daily,
    ComfortResult comfort,
    Scores scores
) {
    public record Geometry(double L, double W, double H, double floorArea, double roofArea,
                            double wallArea, double volume, List<Face> faces, double frontAzimuth) {
    }

    public record Face(String name, double areaM2, double factor) {
    }

    public record UValues(double wall, double roof, double floor) {
    }

    public record Ach(double infiltration, double occupancy, double total) {
    }

    public record OccupancyResult(int persons, String activityLabel, double totalW, double sensibleW,
                                   double latentW, double equipmentW, double latentKgPerHour,
                                   double sensibleKwhPerDay, double occupancyVentLossKwhPerDay,
                                   double netOccupancyEffectKwh, String note, boolean scheduled) {
    }

    public record DailyResult(double solarKwh, double wallLossKwh, double roofLossKwh, double floorLossKwh,
                               double openingLossKwh, double ventLossKwh, double occupancyVentLossKwh,
                               double massExchangeKwh, double internalKwh, double equipmentKwh,
                               double occupantSensibleKwh, double totalLossKwh, double netKwh,
                               double heatingReqKwh, double coolingReqKwh) {
    }

    public record ComfortResult(double comfortHoursPerDay, double dayComfortPct, double nightComfortPct,
                                 double minIndoor, double maxIndoor, double avgIndoor,
                                 double avgExcessOutOfBandC, double inBandPct) {
    }

    public record Scores(double comfortScore, double heatRetentionPct, double solarUtilizationPct,
                          int thermalComfortScore) {
    }

    public record SeriesPoint(double hourDecimal, int stepIndex, double tAmb, double tIndoor, double tMass,
                               double gHoriz, double qSolarWindow, double qWall, double qRoof, double qFloor,
                               double qWindowCond, double qDoorCond, double qVent, double qMassExchange,
                               double qInternal, double qNet, boolean inComfort) {
    }
}
