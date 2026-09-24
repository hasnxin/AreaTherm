package com.areatherm.ml;

/**
 * Shape a surrogate prediction would take (mirrors the 4 independent
 * regression targets the client-side GBM surrogate predicts in
 * app/js/ml-surrogate.js: comfortScore, heatRetentionPct,
 * solarUtilizationPct, energyDemandKwhPerDay) -- defined now so
 * CandidateGenerator-facing code has a stable type to call against, even
 * though no implementation actually produces one yet (see SurrogatePredictor).
 */
public record SurrogatePrediction(double comfortScore, double heatRetentionPct,
                                   double solarUtilizationPct, double energyDemandKwhPerDay) {
}
