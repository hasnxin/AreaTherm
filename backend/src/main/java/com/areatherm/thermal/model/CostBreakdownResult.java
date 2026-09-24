package com.areatherm.thermal.model;

import java.util.List;

/** Mirrors engine.js's estimateCostBreakdown() return object. */
public record CostBreakdownResult(List<LineItem> items, double wasteFactor, long subtotal, long total) {

    public record LineItem(
        String label, long baseCost, double transportMultiplier, double laborMultiplier, long total
    ) {
    }
}
