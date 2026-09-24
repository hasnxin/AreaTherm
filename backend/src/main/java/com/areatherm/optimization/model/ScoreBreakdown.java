package com.areatherm.optimization.model;

/** Mirrors engine.js's scoreCandidate() return object. */
public record ScoreBreakdown(double comfort, double retention, double solar, double energyScore,
                              double costScore, double energyDemand, double total) {
}
