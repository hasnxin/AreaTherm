package com.areatherm.api.dto;

import com.areatherm.simulation.SimulationSummary;

/** GET /simulations/{id} -- summary is null until status is COMPLETE. */
public record SimulationStatusResponse(Long id, String status, SimulationSummary summary, String source) {
    public static SimulationStatusResponse of(Long id, String status, SimulationSummary summary) {
        return new SimulationStatusResponse(id, status, summary, "CALCULATED_RESULT");
    }
}
