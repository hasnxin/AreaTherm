/* AreaTherm — global config. Change APP_NAME/APP_SUBTITLE to rebrand. */
window.APP_CONFIG = {
  APP_NAME: "AreaTherm",
  APP_SUBTITLE: "Area-Specific Passive Shelter Design & Thermal Comfort Prediction Platform",
  TAGLINE: "Design the shelter for the climate — not the climate for the shelter.",
  MODEL_VERSION: "thermal-engine v1.0.0",
  OPTIMIZATION_VERSION: "optimizer v1.0.0",

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
    FURNISHING_CAPACITANCE_FACTOR: 1.0
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
  }
};
