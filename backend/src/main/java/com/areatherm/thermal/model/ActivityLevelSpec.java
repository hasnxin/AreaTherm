package com.areatherm.thermal.model;

/**
 * Mirrors one row of app/js/data.js's ACTIVITY_LEVELS -- resolved and passed
 * in by the caller (design/material layer), same pattern as MaterialProperties,
 * so thermal stays free of any lookup/repository dependency.
 */
public record ActivityLevelSpec(String id, String label, double watts, double sensibleFrac) {
}
