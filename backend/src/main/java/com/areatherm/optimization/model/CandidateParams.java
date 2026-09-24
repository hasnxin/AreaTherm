package com.areatherm.optimization.model;

/**
 * The axis values that produced a candidate design, for display/CSV export
 * (mirrors engine.js buildCandidate()'s `params` object). Material ids are
 * kept as plain strings here (as JS does) -- purely informational, never
 * fed back into the physics.
 */
public record CandidateParams(String orient, double insul, double wpct, String glz,
                               double mass, String wall, String roof, String massMat) {
}
