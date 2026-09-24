package com.areatherm.thermal.model;

import java.util.List;

/**
 * Faithful mirror of the design object app/js/engine.js operates on
 * (see app/js/store.js's defaultDesign()) -- field names/nullability kept
 * close to the JS shape so the port stays mechanical, not a reinterpretation.
 * All material references are already resolved (MaterialProperties), never
 * bare ids -- see MaterialProperties' javadoc for why.
 */
public record Design(
    String name,
    Shape shape,
    Double length, Double width, Double height, Double diameter,
    Double lengthA, Double widthA, Double lengthB, Double widthB,
    CompassOrientation orientation, Double azimuthDeg,
    EnvelopeLayer wall,
    EnvelopeLayer roof,
    FloorLayer floor,
    List<Opening> windows,
    List<Opening> doors,
    Double airLeakageAch,
    ThermalMassSpec thermalMass,
    int occupancy,
    ActivityLevelSpec occupancyActivity,
    double internalHeatGainW,
    Double groundTempC,
    ComfortSpec comfort,
    // Optional 24-entry hour-indexed alternative to the flat
    // occupancy/occupancyActivity pair above -- null (the common case)
    // means "use the flat pair for the whole run", exactly like today.
    // See ThermalEngine.occupancyForHour().
    List<OccupancyScheduleEntry> occupancySchedule
) {
}
