package com.areatherm.thermal.model;

/** Mirrors validationStats()'s return -- mae/rmse/mape are never null; r2 is null when n==0 handled by caller, or when ssTot==0. */
public record ValidationStatsResult(double mae, double rmse, double mape, Double r2, int n) {
    public record Point(double measured, double predicted) {
    }
}
