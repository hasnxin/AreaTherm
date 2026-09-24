package com.areatherm.optimization;

import com.areatherm.optimization.model.MaterialCatalog;
import com.areatherm.thermal.model.MaterialProperties;

import java.util.HashMap;
import java.util.Map;

/** Every material id OptimizationEngine's fixed candidate systems reference, with exact app/js/data.js values. */
public final class TestMaterialCatalog {
    private TestMaterialCatalog() {
    }

    public static MaterialCatalog build() {
        Map<String, MaterialProperties> m = new HashMap<>();
        // WALL
        put(m, "wall_concrete", "WALL", 2400.0, 1.40, 880.0, 200.0, 0.65, 0.35, 0.90, 1400.0, null, "LOW");
        put(m, "wall_brick", "WALL", 1700.0, 0.72, 840.0, 230.0, 0.60, 0.40, 0.90, 1100.0, null, "MEDIUM");
        put(m, "wall_stone", "WALL", 2600.0, 1.70, 850.0, 400.0, 0.55, 0.45, 0.90, 1600.0, null, "MEDIUM");
        put(m, "wall_adobe", "WALL", 1600.0, 0.55, 900.0, 300.0, 0.60, 0.40, 0.90, 650.0, null, "HIGH");
        put(m, "wall_rammed_earth", "WALL", 2000.0, 0.60, 900.0, 350.0, 0.60, 0.40, 0.90, 900.0, null, "HIGH");
        put(m, "wall_mud_block", "WALL", 1500.0, 0.46, 900.0, 300.0, 0.62, 0.38, 0.90, 500.0, null, "HIGH");
        put(m, "wall_aac", "WALL", 550.0, 0.16, 1050.0, 200.0, 0.55, 0.45, 0.90, 950.0, null, "MEDIUM");
        put(m, "wall_insulated_panel", "WALL", 45.0, 0.023, 1400.0, 100.0, 0.45, 0.55, 0.85, 1900.0, null, "MEDIUM");
        put(m, "wall_composite", "WALL", 900.0, 0.09, 950.0, 280.0, 0.55, 0.45, 0.90, 2100.0, null, "MEDIUM");
        // ROOF
        put(m, "roof_rcc", "ROOF", 2400.0, 1.58, 880.0, 150.0, 0.65, 0.35, 0.90, 1500.0, null, "LOW");
        put(m, "roof_metal", "ROOF", 7850.0, 50.0, 490.0, 1.0, 0.55, 0.45, 0.28, 700.0, null, "MEDIUM");
        put(m, "roof_insulated_metal", "ROOF", 40.0, 0.022, 1400.0, 80.0, 0.45, 0.55, 0.30, 1700.0, null, "MEDIUM");
        put(m, "roof_composite", "ROOF", 300.0, 0.05, 1000.0, 120.0, 0.50, 0.50, 0.75, 1600.0, null, "MEDIUM");
        put(m, "roof_earth", "ROOF", 1700.0, 0.80, 900.0, 250.0, 0.65, 0.35, 0.90, 850.0, null, "HIGH");
        // INSULATION
        put(m, "ins_puf", "INSULATION", 32.0, 0.023, 1400.0, 75.0, 0.4, 0.6, 0.6, 750.0, null, "LOW");
        // THERMAL MASS
        putMass(m, "mass_stone", 2700.0, 2.2, 850.0, null, null, 0.6, 0.4, 0.9, 6.0, "MEDIUM");
        putMass(m, "mass_water", 1000.0, 0.6, 4186.0, null, null, 0.9, 0.1, 0.95, 0.05, "HIGH");
        putMass(m, "mass_pcm", 900.0, 0.2, 2100.0, 24.0, 190000.0, 0.5, 0.5, 0.9, 350.0, "MEDIUM");
        putMass(m, "mass_earth", 1900.0, 1.0, 900.0, null, null, 0.6, 0.4, 0.9, 1.0, "HIGH");
        putMass(m, "mass_composite", 1800.0, 1.1, 1400.0, 24.0, 90000.0, 0.55, 0.45, 0.9, 120.0, "MEDIUM");
        putMass(m, "mass_concrete", 2400.0, 1.4, 880.0, null, null, 0.6, 0.4, 0.9, 5.0, "LOW");
        // WINDOW / GLAZING
        putGlazing(m, "glaze_single", 5.8, 0.85, 1200.0, "LOW");
        putGlazing(m, "glaze_double", 2.8, 0.70, 3200.0, "MEDIUM");
        putGlazing(m, "glaze_triple", 1.6, 0.58, 5200.0, "MEDIUM");
        putGlazing(m, "glaze_lowe", 1.8, 0.62, 4200.0, "HIGH");
        return new MaterialCatalog(m);
    }

    private static void put(Map<String, MaterialProperties> m, String id, String category, double density, double k,
                             double cp, double defaultThicknessMm, double absorptivity, double reflectivity,
                             double emissivity, double costPerM2, Double shgc, String sustainability) {
        m.put(id, new MaterialProperties(id, category, density, k, cp, defaultThicknessMm, absorptivity, reflectivity,
            emissivity, null, shgc, null, null, costPerM2, null, sustainability));
    }

    private static void putMass(Map<String, MaterialProperties> m, String id, double density, double k, double cp,
                                 Double pcmMeltC, Double pcmLatentJKg, double absorptivity, double reflectivity,
                                 double emissivity, double costPerKg, String sustainability) {
        m.put(id, new MaterialProperties(id, "THERMAL_MASS", density, k, cp, null, absorptivity, reflectivity,
            emissivity, null, null, pcmMeltC, pcmLatentJKg, null, costPerKg, sustainability));
    }

    private static void putGlazing(Map<String, MaterialProperties> m, String id, double uValue, double shgc, double costPerM2, String sustainability) {
        m.put(id, new MaterialProperties(id, "WINDOW", null, null, null, null, null, null, null,
            uValue, shgc, null, null, costPerM2, null, sustainability));
    }
}
