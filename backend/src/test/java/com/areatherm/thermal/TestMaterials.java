package com.areatherm.thermal;

import com.areatherm.thermal.model.MaterialProperties;

/** Exact values from app/js/data.js's MATERIALS array, for the materials the physics golden fixtures use. */
public final class TestMaterials {
    private TestMaterials() {
    }

    public static MaterialProperties wallInsulatedPanel() {
        return new MaterialProperties("wall_insulated_panel", "WALL", 45.0, 0.023, 1400.0, 100.0,
            0.45, 0.55, 0.85, null, null, null, null, 1900.0, null, "MEDIUM");
    }

    public static MaterialProperties roofInsulatedMetal() {
        return new MaterialProperties("roof_insulated_metal", "ROOF", 40.0, 0.022, 1400.0, 80.0,
            0.45, 0.55, 0.30, null, null, null, null, 1700.0, null, "MEDIUM");
    }

    public static MaterialProperties wallConcrete() {
        return new MaterialProperties("wall_concrete", "WALL", 2400.0, 1.40, 880.0, 200.0,
            0.65, 0.35, 0.90, null, null, null, null, 1400.0, null, "LOW");
    }

    public static MaterialProperties insPuf() {
        return new MaterialProperties("ins_puf", "INSULATION", 32.0, 0.023, 1400.0, 75.0,
            0.4, 0.6, 0.6, null, null, null, null, 750.0, null, "LOW");
    }

    public static MaterialProperties glazeSingle() {
        return new MaterialProperties("glaze_single", "WINDOW", null, null, null, null,
            null, null, null, 5.8, 0.85, null, null, 1200.0, null, "LOW");
    }

    public static MaterialProperties massConcrete() {
        return new MaterialProperties("mass_concrete", "THERMAL_MASS", 2400.0, 1.4, 880.0, null,
            0.6, 0.4, 0.9, null, null, null, null, null, 5.0, "LOW");
    }

    public static MaterialProperties massPcm() {
        return new MaterialProperties("mass_pcm", "THERMAL_MASS", 900.0, 0.2, 2100.0, null,
            0.5, 0.5, 0.9, null, null, 24.0, 190000.0, null, 350.0, "MEDIUM");
    }
}
