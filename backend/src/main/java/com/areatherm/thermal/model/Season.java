package com.areatherm.thermal.model;

import java.util.List;

/**
 * Mirrors engine.js's `season` parameter. Either `hourly` carries a real
 * 24-point series (interpolated directly), or the tMin/tMax/sunrise/sunset/
 * solarKwhDay fields drive the synthetic sinusoidal/bell-curve fallback --
 * see ThermalEngine.ambientTempAt/solarIrradianceAt.
 */
public record Season(
    double tMin, double tMax, double solarKwhDay, double sunrise, double sunset,
    double windMs, double rhPct, double cloudPct,
    Double latitude,
    Double avgTempCAnnual,
    List<MonthlyTemp> monthlyTemp,   // size 12, index 0 = January, or null
    List<HourlyPoint> hourly         // size 24, or null
) {
    public record HourlyPoint(double temp, double solar, double windMs) {
    }

    /** Mirrors nasa-power.js's monthlyTemp[i].tempC shape -- engine.js's estimateGroundTempC reads only this field. */
    public record MonthlyTemp(double tempC) {
    }
}
