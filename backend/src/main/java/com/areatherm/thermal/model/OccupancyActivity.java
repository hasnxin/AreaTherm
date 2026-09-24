package com.areatherm.thermal.model;

/** Matches data.js ACTIVITY_LEVELS ids -- watts/sensibleFrac live on MaterialProperties-style lookup, resolved by the caller. */
public enum OccupancyActivity {
    SLEEPING, SEATED, LIGHT, MODERATE, HEAVY
}
