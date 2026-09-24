package com.areatherm.api;

import com.areatherm.api.dto.CreateOptimizationRunRequest;
import com.areatherm.api.dto.DesignCandidateResponse;
import com.areatherm.optimization.OptimizationEngine;
import com.areatherm.optimization.model.Weights;
import com.areatherm.optimizationrun.DesignCandidate;
import com.areatherm.optimizationrun.DesignCandidateSummary;
import com.areatherm.optimizationrun.OptimizationRun;
import com.areatherm.optimizationrun.OptimizationRunService;
import com.areatherm.simulation.PeriodTypeConverter;
import com.areatherm.thermal.model.SimConfig;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Implements API_SPEC.md's Optimization resource (grid-search only -- see OptimizationEngine's class javadoc). */
@RestController
@RequestMapping("/api/v1/optimization-runs")
public class OptimizationRunController {

    private final OptimizationRunService optimizationRunService;
    private final PeriodTypeConverter periodTypeConverter = new PeriodTypeConverter();

    public OptimizationRunController(OptimizationRunService optimizationRunService) {
        this.optimizationRunService = optimizationRunService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody CreateOptimizationRunRequest req) {
        try {
            CreateOptimizationRunRequest.WeightsRequest w = req.weights() != null
                ? req.weights() : new CreateOptimizationRunRequest.WeightsRequest(0.40, 0.25, 0.15, 0.10, 0.10);
            SimConfig.PeriodType periodType = periodTypeConverter.convertToEntityAttribute(
                req.periodType() != null && !req.periodType().isBlank() ? req.periodType() : "24H"
            );
            OptimizationRun run = optimizationRunService.createQueued(
                req.projectId(), req.baseShelterDesignId(), req.climateProfileId(),
                req.timeStepMinutes() > 0 ? req.timeStepMinutes() : 60, periodType,
                new Weights(w.comfort(), w.retention(), w.solar(), w.energy(), w.cost()),
                req.broaderSearch()
            );
            optimizationRunService.runAsync(run.getId());
            return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("id", run.getId(), "status", run.getStatus().name()));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        OptimizationRun run = optimizationRunService.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No optimization run with id " + id));
        List<DesignCandidate> candidateEntities = optimizationRunService.getCandidates(id);
        Map<Long, DesignCandidateSummary> summaries = optimizationRunService.getDesignSummaries(id, candidateEntities);
        List<DesignCandidateResponse> candidates = candidateEntities.stream()
            .map(c -> DesignCandidateResponse.from(c, summaries.get(c.getId()))).toList();
        List<DesignCandidateResponse> top = candidates.stream()
            .filter(c -> c.label() != null && c.label().length() == 1 && Character.isUpperCase(c.label().charAt(0)))
            .toList();
        DesignCandidateResponse recommended = candidates.stream().filter(DesignCandidateResponse::isRecommended).findFirst().orElse(null);
        return Map.of(
            "id", run.getId(), "status", run.getStatus().name(),
            "candidatesEvaluated", run.getCandidatesEvaluated() != null ? run.getCandidatesEvaluated() : 0,
            "usedMlScreening", run.isUsedMlScreening(),
            "top", top, "recommended", recommended != null ? recommended : Map.of(), "all", candidates
        );
    }

    @GetMapping("/{id}/sensitivity")
    public Map<String, Object> sensitivity() {
        // Sensitivity analysis is a synchronous, on-demand computation
        // (OptimizationEngine.sensitivityAnalysis) rather than something
        // persisted per optimization_run -- wiring this to a real base
        // design + climate profile + weights is a follow-up, not yet
        // reachable from this endpoint alone (no request body defined in
        // API_SPEC.md for a bare GET here).
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED,
            "Sensitivity analysis is implemented in OptimizationEngine.sensitivityAnalysis but not yet wired to this endpoint");
    }
}
