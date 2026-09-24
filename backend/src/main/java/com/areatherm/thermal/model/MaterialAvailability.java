package com.areatherm.thermal.model;

/**
 * Mirrors data.js's materialAvailability() -- a rule-based estimate from a
 * material's sustainability tag and a site's elevation (a remoteness
 * proxy), not a supplier directory. See ThermalEngine.materialAvailability.
 */
public record MaterialAvailability(boolean availableLocally, int leadTimeDays, double transportMultiplier) {
}
