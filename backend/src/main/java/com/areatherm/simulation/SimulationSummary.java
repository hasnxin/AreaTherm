package com.areatherm.simulation;

import com.areatherm.thermal.model.SimulationResult;

/**
 * Every field of {@link SimulationResult} except {@code series} -- what
 * GET /simulations/{id} returns as "summary" per API_SPEC.md, and what gets
 * serialized into {@code simulation.summary_json}. A plain re-shaping, not
 * a re-derivation: every number here came from the one authoritative
 * ThermalEngine.runSimulation() call.
 */
public record SimulationSummary(
    SimulationResult.Geometry geometry,
    SimulationResult.UValues uValues,
    double netWallArea, double windowArea, double doorArea,
    SimulationResult.Ach ach,
    SimulationResult.OccupancyResult occupancy,
    SimulationResult.DailyResult daily,
    SimulationResult.ComfortResult comfort,
    SimulationResult.Scores scores
) {
    public static SimulationSummary from(SimulationResult r) {
        return new SimulationSummary(
            r.geometry(), r.uValues(), r.netWallArea(), r.windowArea(), r.doorArea(),
            r.ach(), r.occupancy(), r.daily(), r.comfort(), r.scores()
        );
    }
}
