package com.areatherm.ml;

import com.areatherm.optimization.model.MaterialCatalog;
import com.areatherm.thermal.model.Design;
import com.areatherm.thermal.model.Season;
import org.springframework.stereotype.Component;

/**
 * The only SurrogatePredictor bean this build wires up: always unavailable.
 * No trained model, no GBM port, no LLM call -- nothing computed here at
 * all. Exists purely so the rest of the codebase (a future
 * OptimizationRunService honoring a `broaderSearch` request flag) has a
 * real seam to call through, rather than a TODO or a missing package.
 */
@Component
public class NotConfiguredSurrogatePredictor implements SurrogatePredictor {

    @Override
    public boolean isAvailable() {
        return false;
    }

    @Override
    public SurrogatePrediction predict(Design design, Season season, MaterialCatalog catalog) {
        throw new UnsupportedOperationException(
            "No ML surrogate is configured in this build -- check isAvailable() before calling predict()."
        );
    }
}
