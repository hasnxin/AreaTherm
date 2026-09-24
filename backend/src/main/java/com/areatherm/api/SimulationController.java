package com.areatherm.api;

import com.areatherm.api.dto.CreateSimulationRequest;
import com.areatherm.api.dto.SeriesPointResponse;
import com.areatherm.api.dto.SimulationStatusResponse;
import com.areatherm.simulation.PeriodTypeConverter;
import com.areatherm.simulation.Simulation;
import com.areatherm.simulation.SimulationResultPoint;
import com.areatherm.simulation.SimulationService;
import com.areatherm.simulation.SimulationSummary;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Implements API_SPEC.md's Simulation resource. POST returns 202 Accepted
 * immediately (see SimulationService.createQueued/runAsync's QUEUED ->
 * RUNNING -> COMPLETE/FAILED lifecycle) -- the caller polls GET
 * /simulations/{id} for a result.
 */
@RestController
@RequestMapping("/api/v1/simulations")
public class SimulationController {

    private final SimulationService simulationService;
    private final ObjectMapper objectMapper;
    private final PeriodTypeConverter periodTypeConverter = new PeriodTypeConverter();

    public SimulationController(SimulationService simulationService, ObjectMapper objectMapper) {
        this.simulationService = simulationService;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody CreateSimulationRequest req) {
        try {
            Simulation sim = simulationService.createQueued(
                req.projectId(), req.shelterDesignId(), req.climateProfileId(),
                req.timeStepMinutes() > 0 ? req.timeStepMinutes() : 60,
                periodTypeConverter.convertToEntityAttribute(req.periodType()),
                req.startAt(), req.endAt(), req.runByUserId()
            );
            simulationService.runAsync(sim.getId());
            return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("id", sim.getId(), "status", sim.getStatus().name()));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public SimulationStatusResponse get(@PathVariable Long id) {
        Simulation sim = simulationService.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No simulation with id " + id));
        SimulationSummary summary = null;
        if (sim.getSummaryJson() != null) {
            try {
                summary = objectMapper.readValue(sim.getSummaryJson(), SimulationSummary.class);
            } catch (Exception e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not parse stored simulation summary");
            }
        }
        return SimulationStatusResponse.of(sim.getId(), sim.getStatus().name(), summary);
    }

    @GetMapping("/{id}/series")
    public Page<SeriesPointResponse> series(@PathVariable Long id, Pageable pageable) {
        simulationService.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No simulation with id " + id));
        Page<SimulationResultPoint> page = simulationService.getSeries(id, pageable);
        return page.map(SeriesPointResponse::from);
    }
}
