package com.areatherm.optimization.model;

/** Mirrors config.js DEFAULT_WEIGHTS -- user-adjustable multi-criteria weighting. */
public record Weights(double comfort, double retention, double solar, double energy, double cost) {
    public static Weights defaults() {
        return new Weights(0.40, 0.25, 0.15, 0.10, 0.10);
    }
}
