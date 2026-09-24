package com.areatherm.optimization;

import com.areatherm.optimization.model.*;
import com.areatherm.thermal.TestMaterials;
import com.areatherm.thermal.model.*;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-end sanity check for the ported optimizer (not a JS golden-file
 * comparison like ThermalEngineGoldenFileTest -- OptimizationEngine's
 * correctness rests on ThermalEngine's already-verified physics plus this
 * class's own search/scoring wiring, which this test exercises for real).
 */
class OptimizationEngineSmokeTest {

    private static Design baselineDesign() {
        EnvelopeLayer wall = new EnvelopeLayer(TestMaterials.wallInsulatedPanel(), 186, TestMaterials.insPuf(), 35.0);
        EnvelopeLayer roof = new EnvelopeLayer(TestMaterials.roofInsulatedMetal(), 101, TestMaterials.insPuf(), 69.0);
        FloorLayer floor = new FloorLayer(TestMaterials.wallConcrete(), 100.0);
        Opening window = new Opening(2.91, 1, OpeningFace.FRONT, TestMaterials.glazeSingle());
        Opening door = new Opening(1.8, 1, OpeningFace.FRONT, null);
        ThermalMassSpec mass = new ThermalMassSpec(TestMaterials.massConcrete(), 1622, 5.406666666666666, MassExposure.FLOOR);
        ComfortSpec comfort = new ComfortSpec(15, 27);
        return new Design(
            "Baseline Shelter", Shape.RECTANGULAR, 6.0, 4.0, 3.0, null,
            null, null, null, null,
            CompassOrientation.SOUTH, 0.0,
            wall, roof, floor, List.of(window), List.of(door),
            0.8, mass, 2, new ActivityLevelSpec("SEATED", "Resting / Seated", 120, 0.75), 150, null, comfort, null
        );
    }

    private static Season winterSeason() {
        return new Season(4.4, 16.1, 5.4, 5.9, 18.9, 2.3, 33, 20, 34.15, -2.75, null, null);
    }

    @Test
    void runOptimization_evaluates567CandidatesAndRanksThem() {
        MaterialCatalog catalog = TestMaterialCatalog.build();
        SimConfig simConfig = new SimConfig(60, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1);
        OptimizationResult result = OptimizationEngine.runOptimization(
            baselineDesign(), winterSeason(), simConfig, Weights.defaults(), catalog, false
        );

        assertEquals(567, result.candidatesEvaluated(), "60 (stage1) + 448 (stage2) + 59 (stage3) = 567");
        assertEquals(567, result.all().size());
        assertFalse(result.usedMlScreening(), "ML surrogate is not ported this round -- must always be false");
        assertNull(result.mlScreenedFrom());
        assertEquals(5, result.top().size());
        assertEquals(result.top().get(0), result.recommended());
        assertTrue(result.recommended().isRecommended());
        assertEquals("A", result.top().get(0).label());
        assertEquals("E", result.top().get(4).label());

        // Ranking must be non-increasing by total score, and no candidate carries a full series.
        double prevScore = Double.POSITIVE_INFINITY;
        for (OptimizationResult.ScoredCandidate c : result.all()) {
            assertTrue(c.score().total() <= prevScore + 1e-9, "results must be sorted best-first");
            prevScore = c.score().total();
            assertTrue(c.result().series().isEmpty(), "no per-candidate hourly series should be retained");
        }
    }

    @Test
    void sensitivityAnalysis_ranksSevenPerturbationsByAbsoluteImpact() {
        MaterialCatalog catalog = TestMaterialCatalog.build();
        SimConfig simConfig = new SimConfig(60, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1);
        SensitivityResult result = OptimizationEngine.sensitivityAnalysis(baselineDesign(), winterSeason(), simConfig, Weights.defaults(), catalog);

        assertEquals(7, result.impacts().size());
        double prevAbs = Double.POSITIVE_INFINITY;
        for (SensitivityResult.ParameterImpact impact : result.impacts()) {
            assertTrue(Math.abs(impact.deltaScore()) <= prevAbs + 1e-9, "must be sorted by |deltaScore| descending");
            prevAbs = Math.abs(impact.deltaScore());
        }
    }

    @Test
    void recommendWindowLayout_evaluatesFourLayoutsAndPicksABest() {
        SimConfig simConfig = new SimConfig(60, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1);
        WindowLayoutResult result = OptimizationEngine.recommendWindowLayout(baselineDesign(), winterSeason(), simConfig);

        assertNotNull(result);
        assertNotNull(result.current());
        assertEquals("Current layout", result.current().label());
        assertNotNull(result.best());
        assertTrue(result.all().size() >= 1 && result.all().size() <= 4);
        assertTrue(result.best().score() >= result.all().get(result.all().size() - 1).score());
    }
}
