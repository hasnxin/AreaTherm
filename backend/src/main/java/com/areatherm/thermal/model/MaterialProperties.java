package com.areatherm.thermal.model;

/**
 * Pre-resolved material properties, mirroring one row of app/js/data.js's
 * MATERIALS array. Passed by value into thermal/optimization so those
 * packages never look a material up by id themselves (that would require a
 * repository dependency, which they must not have — see ThermalEngine).
 */
public record MaterialProperties(
    String id,
    String category,
    Double density,
    Double k,
    Double cp,
    Double defaultThicknessMm,
    Double absorptivity,
    Double reflectivity,
    Double emissivity,
    // WINDOW-category rows only (data.js): a glazing's conductive U-value is
    // given directly, not derived from k/thickness like every other category.
    Double uValue,
    Double shgc,
    Double pcmMeltC,
    Double pcmLatentJKg,
    Double costPerM2,
    Double costPerKg,
    String sustainability
) {
    public double absorptivityOrDefault(double fallback) {
        return absorptivity != null ? absorptivity : fallback;
    }
}
