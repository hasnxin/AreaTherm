/* AreaTherm — global config. Change APP_NAME/APP_SUBTITLE to rebrand. */
window.APP_CONFIG = {
  APP_NAME: "AreaTherm",
  APP_SUBTITLE: "Area-Specific Passive Shelter Design & Thermal Comfort Prediction Platform",
  TAGLINE: "Design the shelter for the climate — not the climate for the shelter.",
  MODEL_VERSION: "thermal-engine v1.1.0",
  OPTIMIZATION_VERSION: "optimizer v1.1.0",

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
    OUTSIDE_FILM_COEFF_W_M2K: 23,
    MASS_FILM_COEFF_W_M2K: 8,
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
