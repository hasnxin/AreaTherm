package com.areatherm.ml;

import com.areatherm.optimization.model.MaterialCatalog;
import com.areatherm.thermal.model.Design;
import com.areatherm.thermal.model.Season;

/**
 * Seam for a future ML-based optimizer pre-screening layer (ARCHITECTURE.md
 * SS1 "ml/ Surrogate-model layer (optional, SS9)"). Deliberately a stub this
 * round -- infrastructure only, no real prediction logic and no external
 * (LLM or otherwise) API calls of any kind. Mirrors app/js/ml-surrogate.js's
 * own isAvailable() gate exactly, so a caller (a future OptimizationRunService)
 * checks availability and always falls back to OptimizationEngine's real
 * deterministic grid search when this returns false -- which, today, is
 * unconditionally the case.
 */
public interface SurrogatePredictor {
    boolean isAvailable();

    SurrogatePrediction predict(Design design, Season season, MaterialCatalog catalog);
}
