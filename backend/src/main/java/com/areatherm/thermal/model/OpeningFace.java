package com.areatherm.thermal.model;

/**
 * The house-relative face a window/door sits on, exactly as engine.js
 * matches openings for solid-area subtraction and window solar gain
 * (FRONT/BACK/LEFT/RIGHT for a 4-face rectangular/square shelter,
 * CURVED_WALL/L_WALL for the single-face round/dome/L-shape geometries).
 * Deliberately not a compass direction -- see DATABASE_SCHEMA.sql's
 * opening.orientation comment for why.
 */
public enum OpeningFace {
    FRONT, BACK, LEFT, RIGHT, CURVED_WALL, L_WALL
}
