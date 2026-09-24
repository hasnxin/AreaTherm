package com.areatherm.thermal.model;

/**
 * A window, door, or vent group (areaEach x count). glazingMaterial is set
 * for windows only (doors/vents pass null -- engine.js hard-codes a 1.8
 * W/m2K door U-value, see ThermalEngine.DOOR_U_VALUE).
 */
public record Opening(double areaEach, int count, OpeningFace face, MaterialProperties glazingMaterial) {
    public double totalArea() {
        return areaEach * count;
    }
}
