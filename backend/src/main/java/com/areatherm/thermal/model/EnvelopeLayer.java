package com.areatherm.thermal.model;

/**
 * A wall or roof construction: primary material + thickness, plus an
 * optional insulation layer. Wall and roof are structurally identical in
 * engine.js (both go through layerResistance() the same way), so one type
 * serves both -- see Design.wall()/Design.roof().
 */
public record EnvelopeLayer(
    MaterialProperties material,
    double thicknessMm,
    MaterialProperties insulationMaterial,
    Double insulationThicknessMm
) {
}
