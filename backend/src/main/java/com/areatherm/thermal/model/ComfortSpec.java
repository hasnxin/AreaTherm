package com.areatherm.thermal.model;

/** engine.js only ever reads comfort.min/comfort.max directly -- clothing-level/activity-level
 *  shift is a UI/design-layer concern already baked into `min` before it reaches ThermalEngine. */
public record ComfortSpec(double min, double max) {
}
