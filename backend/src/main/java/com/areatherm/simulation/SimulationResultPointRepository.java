package com.areatherm.simulation;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimulationResultPointRepository extends JpaRepository<SimulationResultPoint, Long> {

    // Backs GET /simulations/{id}/series (API_SPEC.md) -- real pagination
    // over a potentially multi-thousand-row time series.
    Page<SimulationResultPoint> findBySimulationIdOrderByTsOffsetMinutesAsc(Long simulationId, Pageable pageable);
}
