package com.areatherm.optimization.model;

import com.areatherm.thermal.model.Design;
import com.areatherm.thermal.model.SimulationResult;

import java.util.List;

/** Mirrors engine.js's runOptimization() return object. */
public record OptimizationResult(
    int candidatesEvaluated,
    List<ScoredCandidate> top,
    ScoredCandidate recommended,
    List<ScoredCandidate> all,
    boolean usedMlScreening,
    Integer mlScreenedFrom
) {
    public record ScoredCandidate(
        Design design, CandidateParams params, SimulationResult result, long cost,
        ScoreBreakdown score, int rank, String label, boolean isRecommended
    ) {
    }
}
