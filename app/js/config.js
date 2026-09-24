/* AreaTherm — global config. Change APP_NAME/APP_SUBTITLE to rebrand. */
window.APP_CONFIG = {
  APP_NAME: "AreaTherm",
  APP_SUBTITLE: "Area-Specific Passive Shelter Design & Thermal Comfort Prediction Platform",
  TAGLINE: "Design the shelter for the climate — not the climate for the shelter.",
  MODEL_VERSION: "thermal-engine v1.2.0",
  OPTIMIZATION_VERSION: "optimizer v1.2.0",
  ML_SURROGATE_VERSION: "ml-surrogate v1.0.0",

  DEFAULT_WEIGHTS: {
    comfort: 0.40,
    retention: 0.25,
    solar: 0.15,
    energy: 0.10,
    cost: 0.10
  },

  PHYSICS: {
    AIR_DENSITY_KG_M3: 1.2,
    AIR_CP_J_KGK: 1005,
    // Fixed design value for the wall/roof U-value's outside-air surface
    // resistance (Rso) — a static assembly property by convention, so it
    // intentionally does NOT vary with the current hour's wind (see
    // WIND_FILM_COEFF_* below for the hourly-varying coefficient used
    // instead in the sol-air temperature term).
    OUTSIDE_FILM_COEFF_W_M2K: 23,
    // ASHRAE Fundamentals correlation for exterior convective film
    // coefficient as a function of wind speed: h_o = BASE + PER_MS × V
    // (m/s). Used only for the hourly sol-air temperature term in
    // engine.js's runSimulation — that term already varies hour-to-hour
    // with real weather, unlike the static Rso above.
    WIND_FILM_COEFF_BASE_W_M2K: 5.8,
    WIND_FILM_COEFF_PER_MS: 3.9,
    MASS_FILM_COEFF_W_M2K: 8,
    // Natural/forced-convection film coefficient by thermal-mass exposure —
    // a documented heuristic (order-of-magnitude natural-convection range,
    // not an independently lab-measured figure), not a uniform constant:
    // a floor-embedded mass sees far less room-air movement than an
    // exposed, fan-assisted one. FLOOR matches MASS_FILM_COEFF_W_M2K above
    // so any design saved before this field existed behaves identically.
    THERMAL_MASS_EXPOSURE_H_VALUES: {
      FLOOR: 8, WALL: 12, DEDICATED: 15, BURIED: 6
    },
    FURNISHING_CAPACITANCE_FACTOR: 1.0,
    // Documented assumption (order-of-magnitude general ventilation guideline,
    // not a specific code-compliance calculation): additional fresh-air
    // allowance per occupant, used to couple ventilation rate to occupancy.
    OCCUPANT_FRESH_AIR_LPS: 7.5,
    // Latent heat of vaporization of water at ~20°C, used only to convert an
    // occupant's latent heat share into an illustrative moisture-generation
    // figure (kg/h) for display — not a full psychrometric/humidity simulation.
    WATER_LATENT_HEAT_J_KG: 2454000
  },

  ORIENTATION_FACTORS: {
    SOUTH: 1.00, SE: 0.85, SW: 0.85,
    EAST: 0.55, WEST: 0.55,
    NE: 0.30, NW: 0.30,
    NORTH: 0.15
  },

  UNITS: {
    temp: "°C", energy: "kWh", power: "W", area: "m²", volume: "m³",
    length: "m", thickness: "mm", irradiance: "W/m²", solarAnnual: "kWh/m²/yr",
    wind: "m/s", cost: "₹"
  },
  // Display-only labels for the Imperial toggle. Area/volume/irradiance/
  // solarAnnual/cost aren't converted — the engine and every other screen
  // stay metric (see the Units section note in Settings).
  UNITS_IMPERIAL: {
    temp: "°F", energy: "kWh", power: "Btu/h", area: "m²", volume: "m³",
    length: "ft", thickness: "mm", irradiance: "W/m²", solarAnnual: "kWh/m²/yr",
    wind: "mph", cost: "₹"
  },

  // Reliability layer defaults (see app/js/reliability.js). Applied to every
  // external API call (Open-Meteo, NASA POWER, Open-Meteo Elevation) so a
  // slow or unreachable network never freezes the UI or crashes the demo.
  RELIABILITY: {
    TIMEOUT_MS: 7000,
    MAX_RETRIES: 2,
    RETRY_BASE_DELAY_MS: 500,
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: 3,
    CIRCUIT_BREAKER_COOLDOWN_MS: 60000
  }
};
