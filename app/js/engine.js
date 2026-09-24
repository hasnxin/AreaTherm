/* AreaTherm — Thermal Engine + Optimization Engine + Validation Stats.
   Pure functions only (no DOM access) so this module ports directly onto
   a Spring Boot `thermal` / `optimization` service. See ARCHITECTURE.md SS3-4
   for the physics and methodology behind every formula here. */

window.APP_ENGINE = (function () {
  const CFG = window.APP_CONFIG;
  const DATA = window.APP_DATA;
  const AIR_RHO = CFG.PHYSICS.AIR_DENSITY_KG_M3;
  const AIR_CP = CFG.PHYSICS.AIR_CP_J_KGK;
  const H_O = CFG.PHYSICS.OUTSIDE_FILM_COEFF_W_M2K;
  const H_MASS = CFG.PHYSICS.MASS_FILM_COEFF_W_M2K;
  // R_GROUND: below-slab ground-coupling resistance (m²K/W), a flat generic
  // building-physics default — same for every location, not location-specific
  // soil data. (Real per-location soil composition is fetched and shown on
  // the Location & Climate page for context, but deliberately not used here —
  // see Settings' assumptions register for why.) See ARCHITECTURE.md SS8.
  const RSI_WALL = 0.13, RSI_ROOF = 0.10, R_GROUND = 0.50;

  // Orientation offset-from-south (deg), used for the piecewise factor table.
  const ORIENT_OFFSET = { SOUTH: 0, SE: 45, EAST: 90, NE: 135, NORTH: 180, NW: 135, WEST: 90, SW: 45 };
  // High-latitude table (~lat >= 34°N) — the app's original calibration,
  // unchanged, for its Himalayan/Ladakh reference locations where winter
  // solar altitude stays low (a south wall dominates strongly).
  const FACTOR_TABLE_HIGH_LAT = [ [0, 1.00], [45, 0.85], [90, 0.55], [135, 0.30], [180, 0.15] ];
  // Low-latitude table (~lat <= 20°N) — documented heuristic, not a
  // first-principles solar-position derivation. At lower latitudes the
  // solar altitude at solar noon is meaningfully higher even in winter
  // (altitude ≈ 90° − |latitude − declination|; e.g. ≈45° at 21°N vs
  // ≈32° at 34°N on the winter solstice), which is well established to
  // shrink a south wall's advantage over east/west/north — the same
  // general trend the high-latitude table encodes, just less pronounced.
  // Kept internally consistent with the table above (SOUTH pinned to the
  // same 1.00 reference) rather than an independently-scaled table, to
  // avoid a discontinuity in the model's overall solar-gain scale when
  // blending between the two below.
  const FACTOR_TABLE_LOW_LAT = [ [0, 1.00], [45, 0.90], [90, 0.75], [135, 0.55], [180, 0.35] ];

  // Blends smoothly between the two tables by latitude instead of a hard
  // climate-zone cutoff — a hard cutoff would give two sites a few km
  // apart, straddling an arbitrary boundary, a discontinuous jump in
  // predicted solar gain. Latitude is optional (defaults to the original,
  // unchanged high-latitude table) so every call site that doesn't have a
  // location context yet — or a design/result saved before this existed —
  // behaves exactly as before.
  function orientationFactorTableForLatitude(latitude) {
    if (!Number.isFinite(latitude)) return FACTOR_TABLE_HIGH_LAT;
    const latAbs = Math.abs(latitude);
    const t = clamp((latAbs - 20) / (34 - 20), 0, 1);
    return FACTOR_TABLE_HIGH_LAT.map((pt, i) => {
      const lowPt = FACTOR_TABLE_LOW_LAT[i];
      return [pt[0], lowPt[1] + t * (pt[1] - lowPt[1])];
    });
  }

  function orientationFactorFromAngle(angle0to180, latitude) {
    const table = orientationFactorTableForLatitude(latitude);
    const a = Math.max(0, Math.min(180, angle0to180));
    for (let i = 0; i < table.length - 1; i++) {
      const [a0, f0] = table[i], [a1, f1] = table[i + 1];
      if (a >= a0 && a <= a1) {
        const t = (a - a0) / (a1 - a0);
        return f0 + t * (f1 - f0);
      }
    }
    return table[table.length - 1][1];
  }

  function frontAzimuthOf(design) {
    if (design.orientation === "CUSTOM") return ((design.azimuthDeg % 360) + 360) % 360;
    return ORIENT_OFFSET[design.orientation] ?? 0;
  }

  function faceFactor(frontAzimuth, relativeOffsetDeg, latitude) {
    const abs = ((frontAzimuth + relativeOffsetDeg) % 360 + 360) % 360;
    const angle = abs <= 180 ? abs : 360 - abs;
    return orientationFactorFromAngle(angle, latitude);
  }

  // ---- Input validation ---------------------------------------------------
  // Runs before a design ever reaches the RC solver. Catches the inputs that
  // would otherwise propagate a NaN or a divide-by-zero into a blank chart
  // or a crashed page: non-positive geometry, non-positive layer thickness,
  // an inverted comfort band, out-of-range coordinates, negative counts.
  // Returns { valid, errors: string[] } — never throws.
  function validateDesign(design) {
    const errors = [];
    if (!design) { return { valid: false, errors: ["No shelter design is set."] }; }
    const isRound = ["CIRCULAR", "DOME", "SEMI_CIRCULAR"].includes(design.shape);
    if (isRound) {
      if (!(design.diameter > 0)) errors.push("Diameter must be a positive number.");
    } else {
      if (!(design.length > 0)) errors.push("Length must be a positive number.");
      if (!(design.width > 0) && design.shape !== "SQUARE") errors.push("Width must be a positive number.");
    }
    if (!(design.height > 0)) errors.push("Height must be a positive number.");
    if (!design.wall || !(design.wall.thicknessMm > 0)) errors.push("Wall thickness must be a positive number.");
    if (!design.roof || !(design.roof.thicknessMm > 0)) errors.push("Roof thickness must be a positive number.");
    if (design.wall && design.wall.insulationThicknessMm != null && design.wall.insulationThicknessMm < 0) errors.push("Wall insulation thickness cannot be negative.");
    if (design.roof && design.roof.insulationThicknessMm != null && design.roof.insulationThicknessMm < 0) errors.push("Roof insulation thickness cannot be negative.");
    if (design.airLeakageAch != null && design.airLeakageAch < 0) errors.push("Air leakage (ACH) cannot be negative.");
    if (design.occupancy != null && design.occupancy < 0) errors.push("Occupancy cannot be negative.");
    (design.windows || []).forEach((w, i) => {
      if (w.areaEach < 0) errors.push(`Window ${i + 1}: area cannot be negative.`);
      if (w.count < 0) errors.push(`Window ${i + 1}: count cannot be negative.`);
    });
    (design.doors || []).forEach((d, i) => {
      if (d.areaEach < 0) errors.push(`Door ${i + 1}: area cannot be negative.`);
    });
    if (design.thermalMass && design.thermalMass.massKg < 0) errors.push("Thermal mass cannot be negative.");
    if (design.comfort) {
      if (!Number.isFinite(design.comfort.min) || !Number.isFinite(design.comfort.max)) errors.push("Comfort range must be numeric.");
      else if (design.comfort.min >= design.comfort.max) errors.push("Comfort minimum must be lower than comfort maximum.");
    }
    return { valid: errors.length === 0, errors };
  }

  function validateCoordinates(lat, lon) {
    const errors = [];
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push("Latitude must be a number between -90 and 90.");
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) errors.push("Longitude must be a number between -180 and 180.");
    return { valid: errors.length === 0, errors };
  }

  // ---- Geometry --------------------------------------------------------
  // latitude (optional): threaded into each face's orientation factor so
  // solar-gain-by-orientation reflects this specific site's latitude (see
  // orientationFactorTableForLatitude above) rather than one fixed table
  // for every location. Omitted by callers that only need areas/faces for
  // display (2D/3D preview, geometry validation) — harmless there since
  // `.factor` isn't read in those contexts.
  function computeGeometry(design, latitude) {
    let L = design.length || 6, W = design.width || 4, H = design.height || 3;
    let floorArea, roofArea, perimeter;
    const isSemiCircular = design.shape === "SEMI_CIRCULAR";
    const isRound = design.shape === "CIRCULAR" || design.shape === "DOME" || isSemiCircular;
    const isLShape = design.shape === "L_SHAPE";
    if (isRound) {
      const d = design.diameter || Math.max(L, W) || 5;
      const r = d / 2;
      if (isSemiCircular) {
        // A genuine half-circle footprint (a straight wall across the full
        // diameter, closing off a half-disk floor) — not the same shape as
        // CIRCULAR at the same diameter, so it must not share its area
        // formulas. Flat roof, same area as the floor (like CIRCULAR, not
        // domed like DOME).
        floorArea = (Math.PI * r * r) / 2;
        perimeter = d + Math.PI * r; // straight diameter wall + the half-circumference arc
        roofArea = floorArea;
        L = d; W = r; // bounding box: full diameter one way, radius the other
      } else {
        floorArea = Math.PI * r * r;
        perimeter = Math.PI * d;
        roofArea = (design.shape === "DOME") ? 2 * Math.PI * r * r : floorArea;
        L = W = d;
      }
    } else if (isLShape) {
      // Two rectangular wings sharing a corner — wing B sits atop the left
      // portion of wing A's far edge (a standard L-tromino layout). Area
      // adds per the brief; perimeter follows from that same layout
      // (widthB's two edges cancel out of the total). Simplified: modeled
      // as a single thermal zone with one combined wall face, not two
      // independently-coupled zones — a documented approximation, not a
      // full multi-zone simulation.
      const lA = design.lengthA || 4, wA = design.widthA || 4, lB = design.lengthB || 3, wB = design.widthB || 3;
      floorArea = lA * wA + lB * wB;
      perimeter = 2 * (lA + wA + lB);
      roofArea = floorArea;
      L = lA; W = wA;
    } else { // RECTANGULAR / SQUARE / CUSTOM (treated as rectangular)
      if (design.shape === "SQUARE") { W = L; }
      floorArea = L * W;
      perimeter = 2 * (L + W);
      roofArea = L * W;
    }
    const volume = floorArea * H;
    const frontAzimuth = frontAzimuthOf(design);
    let faces;
    if (isRound) {
      const wallArea = perimeter * H;
      faces = [{ name: "CURVED_WALL", areaM2: wallArea, factor: faceFactor(frontAzimuth, 0, latitude) }];
    } else if (isLShape) {
      const wallArea = perimeter * H;
      faces = [{ name: "L_WALL", areaM2: wallArea, factor: faceFactor(frontAzimuth, 0, latitude) }];
    } else {
      faces = [
        { name: "FRONT", areaM2: L * H, factor: faceFactor(frontAzimuth, 0, latitude) },
        { name: "BACK", areaM2: L * H, factor: faceFactor(frontAzimuth, 180, latitude) },
        { name: "LEFT", areaM2: W * H, factor: faceFactor(frontAzimuth, -90, latitude) },
        { name: "RIGHT", areaM2: W * H, factor: faceFactor(frontAzimuth, 90, latitude) }
      ];
    }
    const wallArea = faces.reduce((s, f) => s + f.areaM2, 0);
    return { L, W, H, floorArea, roofArea, wallArea, volume, faces, frontAzimuth };
  }

  // ---- U-values ----------------------------------------------------------
  function layerResistance(materialId, thicknessMm) {
    const m = DATA.materialById(materialId);
    if (!m || !m.k) return 0;
    return (thicknessMm / 1000) / m.k;
  }

  function wallUValue(design) {
    let R = RSI_WALL + 1 / H_O;
    R += layerResistance(design.wall.materialId, design.wall.thicknessMm);
    if (design.wall.insulationMaterialId && design.wall.insulationThicknessMm) {
      R += layerResistance(design.wall.insulationMaterialId, design.wall.insulationThicknessMm);
    }
    return 1 / R;
  }
  function roofUValue(design) {
    let R = RSI_ROOF + 1 / H_O;
    R += layerResistance(design.roof.materialId, design.roof.thicknessMm);
    if (design.roof.insulationMaterialId && design.roof.insulationThicknessMm) {
      R += layerResistance(design.roof.insulationMaterialId, design.roof.insulationThicknessMm);
    }
    return 1 / R;
  }
  function floorUValue(design) {
    const mat = DATA.materialById(design.floor.materialId);
    const thicknessMm = design.floor.thicknessMm || 150;
    let R = R_GROUND + (mat && mat.k ? (thicknessMm / 1000) / mat.k : 0.1);
    return 1 / R;
  }
  function windowUValue(win) {
    const g = DATA.materialById(win.glazingMaterialId);
    return g ? g.uValue : 2.8;
  }

  // Shared by runSimulation and the Validation screen's steady-state
  // predictor (ui-3.js) so the two never silently diverge on how
  // ventilation is derived.
  function windAdjustedInfiltrationAch(design, season) {
    const windFactor = 1 + Math.min(0.6, (season.windMs || 2) * 0.06); // infiltration rises with wind, documented assumption
    return (design.airLeakageAch || 0.6) * windFactor;
  }
  function ventUAFromAch(achV, volumeM3) {
    return (achV * volumeM3 / 3600) * AIR_RHO * AIR_CP;
  }

  // ---- Occupancy heat model -----------------------------------------------
  // Splits each occupant's total (sensible + latent) heat output into a
  // sensible share (heats the indoor-air node below) and a latent share
  // (illustrative moisture-generation figure only — this model has no
  // humidity/psychrometric state node, so latent heat is reported, not
  // simulated). See data.js ACTIVITY_LEVELS for the wattage/fraction table
  // and its citation. "equipmentW" (design.internalHeatGainW) is any other
  // internal gain (a heater, electronics, a lamp) — kept separate from
  // occupant heat and assumed fully sensible.
  function computeOccupancyHeat(design) {
    const activity = DATA.activityLevelById(design.occupancyActivity || "SEATED");
    const persons = Math.max(0, design.occupancy || 0);
    const totalW = persons * activity.watts;
    const sensibleW = totalW * activity.sensibleFrac;
    const latentW = totalW - sensibleW;
    const equipmentW = Math.max(0, design.internalHeatGainW || 0);
    const totalSensibleW = sensibleW + equipmentW;
    const latentKgPerHour = (latentW * 3600) / CFG.PHYSICS.WATER_LATENT_HEAT_J_KG;
    return { activity, persons, totalW, sensibleW, latentW, equipmentW, totalSensibleW, latentKgPerHour };
  }

  // Additional ventilation (ACH) coupled to occupant count — a documented,
  // order-of-magnitude fresh-air allowance (CFG.PHYSICS.OCCUPANT_FRESH_AIR_LPS
  // per person), not a specific ventilation-code compliance calculation.
  // This is what lets a higher occupant count show up as *both* more heat
  // gained and more ventilation lost, instead of only ever a net positive.
  function occupancyAchIncrement(persons, volumeM3) {
    if (!(persons > 0) || !(volumeM3 > 0)) return 0;
    const lps = persons * CFG.PHYSICS.OCCUPANT_FRESH_AIR_LPS;
    const m3PerHour = lps * 3.6; // 1 L/s = 3.6 m3/h
    return m3PerHour / volumeM3;
  }

  // ---- Diurnal ambient temperature & solar irradiance -------------------
  // Two drivers are supported: direct interpolation over a real 24-point
  // hourly curve (the normal path — live data from weather-api.js), and a
  // synthetic sinusoidal/bell-curve fallback for any season object that
  // only carries tMin/tMax/sunrise/sunset without an hourly series. Neither
  // touches the RC simulation loop below; they only supply its driving
  // temperatures.
  function interpHourly(hourly, field, hourDecimal) {
    const h = ((hourDecimal % 24) + 24) % 24;
    const i0 = Math.floor(h) % 24;
    const i1 = (i0 + 1) % 24;
    const frac = h - Math.floor(h);
    const v0 = hourly[i0][field], v1 = hourly[i1][field];
    return v0 + (v1 - v0) * frac;
  }

  function ambientTempAt(season, hourDecimal) {
    if (season.hourly) return interpHourly(season.hourly, "temp", hourDecimal);
    const mean = (season.tMin + season.tMax) / 2;
    const amp = (season.tMax - season.tMin) / 2;
    // Peak at 15:00, trough at 05:00 -> phase shift.
    const rad = ((hourDecimal - 15) / 24) * 2 * Math.PI;
    return mean + amp * Math.cos(rad);
  }

  function solarIrradianceAt(season, hourDecimal) {
    if (season.hourly) return Math.max(0, interpHourly(season.hourly, "solar", hourDecimal));
    const { sunrise, sunset, solarKwhDay } = season;
    if (hourDecimal <= sunrise || hourDecimal >= sunset) return 0;
    const dayLen = sunset - sunrise;
    const x = (hourDecimal - sunrise) / dayLen; // 0..1
    const shape = Math.sin(Math.PI * x); // bell curve, integral over [0,dayLen] = dayLen*2/pi
    const peakWm2 = (solarKwhDay * 1000) / (dayLen * (2 / Math.PI));
    return Math.max(0, shape * peakWm2);
  }

  function windSpeedAt(season, hourDecimal) {
    if (season.hourly) return Math.max(0, interpHourly(season.hourly, "windMs", hourDecimal));
    return Math.max(0, season.windMs || 0);
  }

  // ASHRAE-correlation exterior film coefficient (see config.js
  // WIND_FILM_COEFF_*) — used only for the hourly sol-air temperature term
  // below, not for the static Rso in wallUValue/roofUValue (see comment
  // there): this one is meant to track the actual current hour's wind.
  function windAdjustedFilmCoefficient(windMs) {
    return CFG.PHYSICS.WIND_FILM_COEFF_BASE_W_M2K + CFG.PHYSICS.WIND_FILM_COEFF_PER_MS * Math.max(0, windMs || 0);
  }

  // Ground temperature at typical footing depth (~1-2m) tracks a site's
  // longer-term average far more than the current forecast window's air
  // temperature — using the current week's mean is a poor proxy for it,
  // especially in an extreme season (a winter run would otherwise see the
  // floor "losing heat" to an implausibly cold ground, or the reverse in
  // summer). Prefers real per-location NASA POWER climatology when it's
  // loaded (see nasa-power.js + store.js enrichLocation) — works for ANY
  // location (predefined or a custom map pin), not a fixed city list. A
  // one-month lag is a standard, documented approximation for near-surface
  // soil thermal inertia. Falls back to the previous current-week-average
  // behavior when that climatology hasn't loaded (or failed to load).
  function estimateGroundTempC(season, atDate) {
    const monthly = season.monthlyTemp;
    if (Array.isArray(monthly) && monthly.length === 12) {
      const now = atDate || new Date();
      const laggedIdx = (now.getMonth() - 1 + 12) % 12;
      const v = monthly[laggedIdx] && monthly[laggedIdx].tempC;
      if (Number.isFinite(v)) return v;
    }
    if (Number.isFinite(season.avgTempCAnnual)) return season.avgTempCAnnual;
    return (season.tMin + season.tMax) / 2;
  }

  function massFilmCoefficient(exposure) {
    const table = CFG.PHYSICS.THERMAL_MASS_EXPOSURE_H_VALUES;
    return (table && table[exposure]) || CFG.PHYSICS.MASS_FILM_COEFF_W_M2K;
  }

  // ---- Core hourly simulation --------------------------------------------
  // design: see data model in ARCHITECTURE.md / store.js
  // climate: { season: {tMin,tMax,solarKwhDay,sunrise,sunset,windMs,rhPct}, latitude }
  // simConfig: { timeStepMinutes, days }
  function runSimulation(design, season, simConfig) {
    const geom = computeGeometry(design, season.latitude);
    const uWall = wallUValue(design), uRoof = roofUValue(design), uFloor = floorUValue(design);
    const windowGroups = (design.windows || []).map(w => ({
      ...w, uValue: windowUValue(w), shgc: (DATA.materialById(w.glazingMaterialId) || {}).shgc || 0.7,
      totalArea: (w.areaEach || 0) * (w.count || 0)
    }));
    const doorArea = (design.doors || []).reduce((s, d) => s + (d.areaEach || 0) * (d.count || 0), 0);
    const windowArea = windowGroups.reduce((s, w) => s + w.totalArea, 0);
    const netWallArea = Math.max(0, geom.wallArea - windowArea - doorArea);

    // Per-face SOLID (opaque) area, for the wall UA/solar-gain terms below —
    // without this, a face with a window or door on it was double-counted:
    // once as if it were solid wall over its FULL un-reduced area (including
    // sun-driven sol-air gain as if that whole area were opaque), and again
    // via the window/door's own separate conduction + solar-gain terms. That
    // inflated both heat loss and daytime solar overheating, worse the more
    // window/door area a design has. Round/L-shape geometries model the
    // whole exterior as a single combined face, so every opening (whichever
    // FRONT/BACK/LEFT/RIGHT label it was configured with) is subtracted from
    // that one face instead of matched by name.
    const isSingleFaceShape = geom.faces.length === 1;
    const openingAreaByFace = {};
    windowGroups.forEach(w => { openingAreaByFace[w.orientation] = (openingAreaByFace[w.orientation] || 0) + w.totalArea; });
    (design.doors || []).forEach(d => {
      const face = d.orientation || "FRONT";
      openingAreaByFace[face] = (openingAreaByFace[face] || 0) + (d.areaEach || 0) * (d.count || 0);
    });
    const solidFaceAreas = geom.faces.map(f => {
      const openingsHere = isSingleFaceShape ? (windowArea + doorArea) : (openingAreaByFace[f.name] || 0);
      return Math.max(0, f.areaM2 - openingsHere);
    });

    // Occupancy: computeOccupancyHeat(design) is a pure function of
    // design's occupancy/occupancyActivity fields, so when
    // design.occupancySchedule (24 hour-indexed {persons,activityId}
    // entries) is present, it's recomputed every hour INSIDE the loop
    // below (see occupancyForHour()) so both occupant heat gain and
    // occupancy-linked ventilation load vary hour by hour, not just heat
    // gain. With no schedule this degenerates to calling it on the same
    // unchanged design every iteration -- same inputs every time, so
    // (floating point being deterministic) it reproduces exactly the same
    // numbers as computing it once and reusing, verified by the existing
    // golden fixtures.
    function occupancyForHour(hourDecimal) {
      const sched = design.occupancySchedule;
      if (Array.isArray(sched) && sched.length === 24) {
        const h = Math.floor(((hourDecimal % 24) + 24) % 24);
        const entry = sched[h] || {};
        return computeOccupancyHeat({ ...design, occupancy: entry.persons, occupancyActivity: entry.activityId });
      }
      return computeOccupancyHeat(design);
    }
    // Schedule-averaged summary, for the top-level `occupancy`/`ach`
    // report fields ONLY -- the loop below always uses the real per-hour
    // value (occupancyForHour) for the actual physics, never this.
    const occSummary = (() => {
      const sched = design.occupancySchedule;
      if (Array.isArray(sched) && sched.length === 24) {
        const perHour = sched.map(e => computeOccupancyHeat({ ...design, occupancy: e.persons, occupancyActivity: e.activityId }));
        const avg = key => perHour.reduce((s, o) => s + o[key], 0) / perHour.length;
        return {
          persons: Math.max(...perHour.map(o => o.persons)), avgPersons: avg("persons"),
          activity: { label: "Scheduled (varies by hour)" },
          totalW: avg("totalW"), sensibleW: avg("sensibleW"), latentW: avg("latentW"),
          equipmentW: perHour[0].equipmentW, latentKgPerHour: avg("latentKgPerHour"), scheduled: true
        };
      }
      const flat = computeOccupancyHeat(design);
      return Object.assign({}, flat, { avgPersons: flat.persons, scheduled: false });
    })();

    const infiltrationAch = windAdjustedInfiltrationAch(design, season);
    const occupancyAch = occupancyAchIncrement(occSummary.avgPersons, geom.volume); // reporting only -- see occSummary comment above
    const ach = infiltrationAch + occupancyAch;
    // Constant for the whole run (don't depend on the timestep) — hoisted
    // out of the hourly loop below rather than recomputed every iteration.
    // Occupancy's own share of ventilation (occupancyVentUA/ventUA
    // themselves) is NOT hoisted, unlike before -- both are now computed
    // fresh inside the loop every hour, same as every other UA/ref term
    // there, so an hour-varying schedule's ventilation load is exact
    // rather than averaged.
    const infiltrationUA = ventUAFromAch(infiltrationAch, geom.volume);

    const tm = design.thermalMass;
    let massActive = !!(tm && tm.massKg > 0);
    const massMat = massActive ? DATA.materialById(tm.materialId) : null;
    let cMass = massActive ? tm.massKg * (massMat.cp || 900) : 0;
    const massArea = massActive ? (tm.surfaceAreaM2 || 5) : 0;
    const massH = massActive ? massFilmCoefficient(tm.exposure) : 0;
    const isPcm = massActive && massMat && massMat.pcmMeltC != null;

    const cAir = geom.volume * AIR_RHO * AIR_CP * CFG.PHYSICS.FURNISHING_CAPACITANCE_FACTOR;

    // Material lookups are constant for the whole run — hoisted out of the
    // hourly loop below rather than re-looked-up every iteration.
    const wallMat = DATA.materialById(design.wall.materialId) || { absorptivity: 0.6 };
    const roofMat = DATA.materialById(design.roof.materialId) || { absorptivity: 0.6 };
    // Also constant for the whole run (doesn't depend on hourDecimal) —
    // see estimateGroundTempC above.
    const tGround = design.groundTempC ?? estimateGroundTempC(season);

    const dtSec = (simConfig.timeStepMinutes || 60) * 60;
    const stepsPerDay = Math.round(24 * 3600 / dtSec);
    const totalSteps = stepsPerDay * (simConfig.days || 1);

    let tAir = (season.tMin + season.tMax) / 2;
    let tMass = tAir;
    const series = [];
    const agg = { solarKwh: 0, wallLossKwh: 0, roofLossKwh: 0, floorLossKwh: 0, openingCondLossKwh: 0,
      ventLossKwh: 0, occupancyVentLossKwh: 0, massExchangeKwh: 0, internalKwh: 0, occupantSensibleKwh: 0,
      equipmentKwh: 0, comfortSteps: 0, heatingReqKwh: 0, coolingReqKwh: 0, incidentOnWindowKwh: 0 };

    // Implicit (backward-Euler) update: unconditionally stable for hourly RC
    // building simulation, unlike explicit Euler which diverges here because
    // the indoor-air capacitance is small relative to hourly heat-flow
    // magnitudes. Each node is solved as a UA-weighted average pulling it
    // toward its driving temperatures — unlike explicit Euler this cannot
    // overshoot past those driving temperatures in one step.
    for (let i = 0; i < totalSteps; i++) {
      const hourDecimal = (i * dtSec / 3600) % 24;
      const tAmb = ambientTempAt(season, hourDecimal);
      const gHoriz = solarIrradianceAt(season, hourDecimal);
      // Real per-hour wind (falls back to the day's average when no hourly
      // series exists) feeding the ASHRAE wind-adjusted film coefficient —
      // see windAdjustedFilmCoefficient above for why this is kept separate
      // from the static H_O used in wallUValue/roofUValue.
      const hOuterNow = windAdjustedFilmCoefficient(windSpeedAt(season, hourDecimal));

      // Sol-air temps per face (opaque) — wallMat/roofMat hoisted above the
      // loop. Uses each face's SOLID area (solidFaceAreas), not its full
      // f.areaM2, so a window/door's own terms below aren't double-counted
      // on top of the wall's.
      let wallUA = 0, wallRefSum = 0;
      geom.faces.forEach((f, fi) => {
        const solidArea = solidFaceAreas[fi];
        const gFace = gHoriz * f.factor;
        const tSolAir = tAmb + (wallMat.absorptivity * gFace) / hOuterNow;
        wallUA += uWall * solidArea;
        wallRefSum += uWall * solidArea * tSolAir;
      });
      const tSolAirRoof = tAmb + (roofMat.absorptivity * gHoriz) / hOuterNow;
      const roofUA = uRoof * geom.roofArea, roofRef = roofUA * tSolAirRoof;
      const floorUA = uFloor * geom.floorArea, floorRef = floorUA * tGround;

      let qSolarWindow = 0, windowCondUA = 0;
      windowGroups.forEach(w => {
        const off = { FRONT: 0, BACK: 180, LEFT: -90, RIGHT: 90, PRIMARY: 0 }[w.orientation] ?? 0;
        const f = faceFactor(geom.frontAzimuth, off, season.latitude);
        qSolarWindow += w.totalArea * gHoriz * f * w.shgc;
        windowCondUA += w.uValue * w.totalArea;
      });
      const windowCondRef = windowCondUA * tAmb;
      const doorUA = 1.8 * doorArea, doorRef = doorUA * tAmb; // typical insulated door U~1.8 W/m2K, documented assumption
      const occ = occupancyForHour(hourDecimal);
      const occupancyVentUA = ventUAFromAch(occupancyAchIncrement(occ.persons, geom.volume), geom.volume);
      const ventUA = infiltrationUA + occupancyVentUA; // infiltration hoisted above the loop, occupancy's share is not — see occupancyForHour above
      const ventRef = ventUA * tAmb;
      const qInternal = occ.totalSensibleW; // sensible-only: occupant sensible share + equipment gain
      const massUA = massActive ? massH * massArea : 0, massRef = massUA * tMass;

      const totalUA = wallUA + roofUA + floorUA + windowCondUA + doorUA + ventUA + massUA;
      const totalRef = wallRefSum + roofRef + floorRef + windowCondRef + doorRef + ventRef + massRef + qSolarWindow + qInternal;
      const cDt = cAir / dtSec;
      const nextTair = (cDt * tAir + totalRef) / (cDt + totalUA);

      const qWall = wallUA * nextTair - wallRefSum;
      const qRoof = roofUA * nextTair - roofRef;
      const qFloor = floorUA * nextTair - floorRef;
      const qWindowCond = windowCondUA * nextTair - windowCondRef;
      const qDoorCond = doorUA * nextTair - doorRef;
      const qVent = ventUA * nextTair - ventRef;
      const qVentOccupancy = occupancyVentUA * (nextTair - tAmb); // exact linear partition of qVent
      const qMassExchange = massUA * (nextTair - tMass);

      let nextTmass = tMass;
      if (massActive) {
        const solarToMass = 0.25 * qSolarWindow; // fraction of window solar striking mass surface (floor mass), documented assumption
        let effectiveCMass = cMass;
        if (isPcm && Math.abs(tMass - massMat.pcmMeltC) < 1.5) {
          effectiveCMass = cMass + (tm.massKg * massMat.pcmLatentJKg) / 3; // apparent-Cp approximation over ~3K band
        }
        const cMassDt = effectiveCMass / dtSec;
        nextTmass = (cMassDt * tMass + massUA * nextTair + solarToMass) / (cMassDt + massUA);
      }

      const inComfort = nextTair >= design.comfort.min && nextTair <= design.comfort.max;
      if (inComfort) agg.comfortSteps++;
      if (nextTair < design.comfort.min) {
        agg.heatingReqKwh += ((uWall * geom.wallArea + uRoof * geom.roofArea + uFloor * geom.floorArea + ventUA) * (design.comfort.min - nextTair) * dtSec) / 3.6e6;
      }
      if (nextTair > design.comfort.max) {
        agg.coolingReqKwh += ((uWall * geom.wallArea + uRoof * geom.roofArea) * (nextTair - design.comfort.max) * dtSec) / 3.6e6;
      }

      const qNetAir = qSolarWindow + qInternal - qMassExchange - qWall - qRoof - qFloor - qWindowCond - qDoorCond - qVent;
      series.push({
        hourDecimal, stepIndex: i, tAmb: round2(tAmb), tIndoor: round2(nextTair), tMass: round2(nextTmass),
        gHoriz: round2(gHoriz), qSolarWindow: round2(qSolarWindow), qWall: round2(qWall), qRoof: round2(qRoof),
        qFloor: round2(qFloor), qWindowCond: round2(qWindowCond), qDoorCond: round2(qDoorCond), qVent: round2(qVent),
        qMassExchange: round2(qMassExchange), qInternal: round2(qInternal), qNet: round2(qNetAir), inComfort
      });

      agg.solarKwh += (qSolarWindow * dtSec) / 3.6e6;
      agg.wallLossKwh += Math.max(0, (qWall * dtSec) / 3.6e6);
      agg.roofLossKwh += Math.max(0, (qRoof * dtSec) / 3.6e6);
      agg.floorLossKwh += Math.max(0, (qFloor * dtSec) / 3.6e6);
      agg.openingCondLossKwh += Math.max(0, ((qWindowCond + qDoorCond) * dtSec) / 3.6e6);
      agg.ventLossKwh += Math.max(0, (qVent * dtSec) / 3.6e6);
      agg.occupancyVentLossKwh += Math.max(0, (qVentOccupancy * dtSec) / 3.6e6);
      agg.massExchangeKwh += (qMassExchange * dtSec) / 3.6e6;
      agg.internalKwh += (qInternal * dtSec) / 3.6e6;
      agg.occupantSensibleKwh += (occ.sensibleW * dtSec) / 3.6e6;
      agg.equipmentKwh += (occ.equipmentW * dtSec) / 3.6e6;
      agg.incidentOnWindowKwh += (gHoriz * windowArea * dtSec) / 3.6e6;

      tAir = nextTair;
      tMass = nextTmass;
    }

    const totalDays = simConfig.days || 1;
    const comfortHoursPerDay = (agg.comfortSteps * (dtSec / 3600)) / totalDays;
    const nightSteps = series.filter(s => s.hourDecimal < 6 || s.hourDecimal >= 20);
    const daySteps = series.filter(s => s.hourDecimal >= 6 && s.hourDecimal < 20);
    const nightComfortPct = pct(nightSteps.filter(s => s.inComfort).length, nightSteps.length);
    const dayComfortPct = pct(daySteps.filter(s => s.inComfort).length, daySteps.length);

    const totalLossKwh = agg.wallLossKwh + agg.roofLossKwh + agg.floorLossKwh + agg.openingCondLossKwh + agg.ventLossKwh;
    // Solar utilization = share of the solar energy striking the glazing aperture
    // that actually gets transmitted into the shelter (driven by orientation
    // factor and glazing SHGC) — bounded well under 100% by construction,
    // unlike a gain-vs-loss ratio which saturates at 100% in any lossy building.
    const solarUtilizationPct = agg.incidentOnWindowKwh > 0.001 ? clamp(pct(agg.solarKwh, agg.incidentOnWindowKwh), 0, 100) : 0;
    // Heat retention = how much of the total heat loss is covered by gains
    // (solar + internal + net mass release) — 100% means gains fully offset losses.
    const heatRetentionPct = clamp(pct(agg.solarKwh + agg.internalKwh + Math.max(0, -agg.massExchangeKwh), totalLossKwh), 0, 100);

    // Comfort score blends two things: how OFTEN indoor temp was in-band
    // (inBandPct, as before) and how MILD the misses were on average when it
    // wasn't (severityComponent). A pure in-band% can't tell a 1°C miss from
    // a 30°C one — both just count as "out of band" for that hour — which let
    // a severely-overheating candidate (59.76°C indoor) score in the same
    // neighborhood as a mildly-uncomfortable one. Severity is normalized
    // against the design's own comfort-band width (missing by as much as the
    // whole acceptable range, on average, is treated as maximally severe) —
    // no unexplained constant. Blended rather than subtracted so two designs
    // that are both 0% in-band still separate by how badly they missed,
    // instead of both collapsing to the same score.
    const inBandPct = clamp(0.5 * dayComfortPct + 0.5 * nightComfortPct, 0, 100);
    const outOfBandStepsArr = series.filter(s => !s.inComfort);
    const outOfBandDegSum = outOfBandStepsArr.reduce((sum, s) =>
      sum + Math.max(0, design.comfort.min - s.tIndoor) + Math.max(0, s.tIndoor - design.comfort.max), 0);
    const avgExcessOutOfBandC = outOfBandStepsArr.length ? outOfBandDegSum / outOfBandStepsArr.length : 0;
    const comfortBandWidthC = design.comfort.max - design.comfort.min;
    const severityRatio = comfortBandWidthC > 0 ? clamp(avgExcessOutOfBandC / comfortBandWidthC, 0, 1) : 0;
    const severityComponent = 100 * (1 - severityRatio);
    const comfortScore = clamp(0.6 * inBandPct + 0.4 * severityComponent, 0, 100);
    const energyDemandPerDay = (agg.heatingReqKwh + agg.coolingReqKwh) / totalDays;
    const energyAdequacyPct = clamp(100 - energyDemandPerDay * 1.5, 0, 100);
    // NOTE: this is a custom, project-defined index (weighted blend of modelled
    // comfort-hours%, heat-retention%, solar-utilization% and energy-adequacy%)
    // — it is NOT the PMV/PPD comfort index or any other recognised thermal-
    // comfort standard. See explainScore() / Settings for the exact weights.
    const thermalComfortScore = Math.round(
      0.45 * comfortScore + 0.25 * heatRetentionPct + 0.20 * solarUtilizationPct + 0.10 * energyAdequacyPct
    );

    const minIndoor = Math.min(...series.map(s => s.tIndoor));
    const maxIndoor = Math.max(...series.map(s => s.tIndoor));
    const avgIndoor = round2(series.reduce((sum, s) => sum + s.tIndoor, 0) / series.length);

    const occupantSensibleKwhPerDay = round2(agg.occupantSensibleKwh / totalDays);
    const occupancyVentLossKwhPerDay = round2(agg.occupancyVentLossKwh / totalDays);
    const netOccupancyEffectKwh = round2(occupantSensibleKwhPerDay - occupancyVentLossKwhPerDay);
    let occupancyNote = null;
    if (occSummary.persons > 0) {
      occupancyNote = netOccupancyEffectKwh <= 0.05
        ? `Ventilation increase from ${occSummary.persons} occupant(s) offsets most or all of their body-heat gain (net ${netOccupancyEffectKwh >= 0 ? "+" : ""}${netOccupancyEffectKwh} kWh/day) — a modelled trade-off, not an error.`
        : `Occupants add more sensible heat than the occupancy-linked ventilation removes (net +${netOccupancyEffectKwh} kWh/day).`;
    }

    return {
      geometry: geom, uValues: { wall: uWall, roof: uRoof, floor: uFloor },
      netWallArea, windowArea, doorArea, series,
      ach: { infiltration: round2(infiltrationAch), occupancy: round2(occupancyAch), total: round2(ach) },
      occupancy: {
        persons: occSummary.persons, activityLabel: occSummary.activity.label, totalW: round2(occSummary.totalW),
        sensibleW: round2(occSummary.sensibleW), latentW: round2(occSummary.latentW), equipmentW: round2(occSummary.equipmentW),
        latentKgPerHour: Math.round(occSummary.latentKgPerHour * 1000) / 1000, scheduled: occSummary.scheduled,
        sensibleKwhPerDay: occupantSensibleKwhPerDay, occupancyVentLossKwhPerDay,
        netOccupancyEffectKwh, note: occupancyNote
      },
      daily: {
        solarKwh: round2(agg.solarKwh / totalDays), wallLossKwh: round2(agg.wallLossKwh / totalDays),
        roofLossKwh: round2(agg.roofLossKwh / totalDays), floorLossKwh: round2(agg.floorLossKwh / totalDays),
        openingLossKwh: round2(agg.openingCondLossKwh / totalDays), ventLossKwh: round2(agg.ventLossKwh / totalDays),
        occupancyVentLossKwh: occupancyVentLossKwhPerDay,
        massExchangeKwh: round2(agg.massExchangeKwh / totalDays), internalKwh: round2(agg.internalKwh / totalDays),
        equipmentKwh: round2(agg.equipmentKwh / totalDays), occupantSensibleKwh: occupantSensibleKwhPerDay,
        totalLossKwh: round2(totalLossKwh / totalDays),
        netKwh: round2((agg.solarKwh + agg.internalKwh - totalLossKwh) / totalDays),
        heatingReqKwh: round2(agg.heatingReqKwh / totalDays), coolingReqKwh: round2(agg.coolingReqKwh / totalDays)
      },
      comfort: {
        comfortHoursPerDay: round2(comfortHoursPerDay), dayComfortPct: round2(dayComfortPct),
        nightComfortPct: round2(nightComfortPct), minIndoor: round2(minIndoor), maxIndoor: round2(maxIndoor),
        avgIndoor: avgIndoor, avgExcessOutOfBandC: round2(avgExcessOutOfBandC), inBandPct: round2(inBandPct)
      },
      scores: {
        comfortScore: round2(comfortScore), heatRetentionPct: round2(heatRetentionPct),
        solarUtilizationPct: round2(solarUtilizationPct), thermalComfortScore: clamp(thermalComfortScore, 0, 100)
      }
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }
  function pct(n, d) { return d > 0 ? (100 * n / d) : 0; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // ---- Estimated cost (simple materials-based estimate, INR) -------------
  // Materials + installation + a waste factor only — no labour/transport
  // multiplier, and NOT sourced from a CPWD/state PWD Schedule of Rates.
  // See data.js MATERIALS header and the Materials screen disclaimer.
  function estimateCost(design) {
    const geom = computeGeometry(design);
    const wallMat = DATA.materialById(design.wall.materialId) || {};
    const roofMat = DATA.materialById(design.roof.materialId) || {};
    const insMat = design.wall.insulationMaterialId ? DATA.materialById(design.wall.insulationMaterialId) : null;
    let cost = 0;
    cost += (wallMat.costPerM2 || 1000) * geom.wallArea;
    cost += (roofMat.costPerM2 || 1200) * geom.roofArea;
    if (insMat) cost += (insMat.costPerM2 || 500) * geom.wallArea * ((design.wall.insulationThicknessMm || 0) / 75);
    (design.windows || []).forEach(w => {
      const g = DATA.materialById(w.glazingMaterialId) || {};
      cost += (g.costPerM2 || 2000) * (w.areaEach || 0) * (w.count || 0);
    });
    if (design.thermalMass && design.thermalMass.massKg) {
      const m = DATA.materialById(design.thermalMass.materialId) || {};
      cost += (m.costPerKg || 5) * design.thermalMass.massKg;
    }
    const WASTE_FACTOR = 0.10; // typical, documented assumption
    cost *= (1 + WASTE_FACTOR);
    return Math.round(cost);
  }

  // ---- Estimated cost breakdown (location-aware, INR) --------------------
  // Same per-component costing as estimateCost() above -- added alongside
  // it, not replacing it, so estimateCost's existing callers (including
  // the optimizer's 3 call sites) are unaffected -- but broken into line
  // items and adjusted by each material's real regional transport
  // multiplier (DATA.materialAvailability, already computed from the
  // site's remoteness; previously only ever displayed, never fed into a
  // cost figure). Labor multiplier is a smaller heuristic scaling off that
  // same remoteness signal -- like materialAvailability itself, a
  // disclosed rule-based estimate, not sourced pricing data (see data.js's
  // own disclaimer). With no location (or at zero remoteness), every
  // multiplier is 1 and this returns the same total as estimateCost().
  function estimateCostBreakdown(design, location) {
    const geom = computeGeometry(design);
    const wallMat = DATA.materialById(design.wall.materialId) || {};
    const roofMat = DATA.materialById(design.roof.materialId) || {};
    const insMat = design.wall.insulationMaterialId ? DATA.materialById(design.wall.insulationMaterialId) : null;

    function multipliersFor(materialId) {
      const avail = materialId ? DATA.materialAvailability(materialId, location) : null;
      const transportMultiplier = avail ? avail.transportMultiplier : 1;
      const laborMultiplier = Math.round((1 + (transportMultiplier - 1) * 0.5) * 100) / 100;
      return { transportMultiplier, laborMultiplier };
    }
    function lineItem(label, materialId, baseCost) {
      if (!(baseCost > 0)) return null;
      const { transportMultiplier, laborMultiplier } = multipliersFor(materialId);
      const rawTotal = baseCost * transportMultiplier * laborMultiplier;
      return { label, baseCost: Math.round(baseCost), transportMultiplier, laborMultiplier, total: Math.round(rawTotal), rawTotal };
    }

    const items = [];
    items.push(lineItem("Wall material", design.wall.materialId, (wallMat.costPerM2 || 1000) * geom.wallArea));
    items.push(lineItem("Roof material", design.roof.materialId, (roofMat.costPerM2 || 1200) * geom.roofArea));
    if (insMat) items.push(lineItem("Wall insulation", design.wall.insulationMaterialId, (insMat.costPerM2 || 500) * geom.wallArea * ((design.wall.insulationThicknessMm || 0) / 75)));
    let glazingCost = 0, glazingMaterialId = null;
    (design.windows || []).forEach(w => {
      const g = DATA.materialById(w.glazingMaterialId) || {};
      glazingCost += (g.costPerM2 || 2000) * (w.areaEach || 0) * (w.count || 0);
      glazingMaterialId = glazingMaterialId || w.glazingMaterialId;
    });
    items.push(lineItem("Glazing", glazingMaterialId, glazingCost));
    if (design.thermalMass && design.thermalMass.massKg) {
      const m = DATA.materialById(design.thermalMass.materialId) || {};
      items.push(lineItem("Thermal mass", design.thermalMass.materialId, (m.costPerKg || 5) * design.thermalMass.massKg));
    }

    const filtered = items.filter(Boolean);
    const WASTE_FACTOR = 0.10;
    const subtotal = filtered.reduce((sum, it) => sum + it.rawTotal, 0);
    const total = Math.round(subtotal * (1 + WASTE_FACTOR));
    filtered.forEach(it => { delete it.rawTotal; });
    return { items: filtered, wasteFactor: WASTE_FACTOR, subtotal: Math.round(subtotal), total };
  }

  // ---- Optimization: candidate generation + scoring -----------------------
  function cloneDesign(d) { return JSON.parse(JSON.stringify(d)); }

  // Curated wall/roof "systems" (material + a realistic thickness for that
  // material, from its own defaultThicknessMm) spanning the actual material
  // library — one entry per wall material (stone gets a second, more-
  // insulated variant) and per roof material (RCC likewise). Previously
  // generateCandidates only ever varied insulation *thickness* on whatever
  // wall/roof material happened to already be on the baseline design, so
  // every optimization run recommended the same material regardless of
  // climate — the search space simply never contained an alternative.
  // Iterating material combinations here is what lets a hot-dry site end up
  // recommended a lightweight/insulating wall and a cold site a heavy
  // masonry one, instead of always the same baseline material back.
  function wallSystem(materialId, insulationThicknessMm) {
    const mat = DATA.materialById(materialId);
    return { materialId, thicknessMm: (mat && mat.defaultThicknessMm) || 300, insulationThicknessMm };
  }
  function roofSystem(materialId, insulationThicknessMm) {
    const mat = DATA.materialById(materialId);
    return { materialId, thicknessMm: (mat && mat.defaultThicknessMm) || 150, insulationThicknessMm };
  }
  const WALL_SYSTEMS = [
    wallSystem("wall_stone", 50), wallSystem("wall_stone", 100),
    wallSystem("wall_brick", 75), wallSystem("wall_adobe", 50),
    wallSystem("wall_rammed_earth", 50), wallSystem("wall_mud_block", 50),
    wallSystem("wall_aac", 75), wallSystem("wall_insulated_panel", 50),
    wallSystem("wall_composite", 75), wallSystem("wall_concrete", 100)
  ];
  const ROOF_SYSTEMS = [
    roofSystem("roof_rcc", 50), roofSystem("roof_rcc", 100),
    roofSystem("roof_metal", 50), roofSystem("roof_insulated_metal", 50),
    roofSystem("roof_composite", 50), roofSystem("roof_earth", 50)
  ];
  // null = no thermal mass; otherwise a material + a representative amount.
  // mass_concrete exists in the materials database (DATA.MATERIALS) but was
  // missing here — every other WALL/ROOF/THERMAL_MASS material in the
  // database has a search option; this was the one gap.
  const MASS_OPTIONS = [
    null,
    { materialId: "mass_stone", massKg: 900 }, { materialId: "mass_water", massKg: 900 },
    { materialId: "mass_pcm", massKg: 400 }, { materialId: "mass_composite", massKg: 900 },
    { materialId: "mass_earth", massKg: 1600 }, { materialId: "mass_concrete", massKg: 900 }
  ];
  const SECONDARY_ORIENTATIONS = ["SOUTH", "SE", "SW", "EAST"];
  const SECONDARY_WINDOW_PCT = [0.08, 0.12, 0.16, 0.20];
  const SECONDARY_GLAZINGS = ["glaze_single", "glaze_double", "glaze_triple", "glaze_lowe"];
  // How many top wall+roof envelopes (by Stage 1 score) get the full
  // secondary grid in Stage 2. 1 is sufficient because Stage 3 re-opens the
  // full wall x roof envelope grid against the true winning secondary combo
  // regardless (see generateCandidates) — raise to 2 for extra margin at
  // +~380 candidates and a runtime that starts to matter on the 7-day option.
  const ENVELOPE_FINALISTS = 1;

  // Single source of truth for "how do 6 axis values become a design" —
  // shared by every search stage below.
  function buildCandidate(baseDesign, wallSys, roofSys, orient, wpct, glz, massOpt) {
    const d = cloneDesign(baseDesign);
    d.orientation = orient === "SOUTH" || orient === "EAST" ? orient : "CUSTOM";
    if (orient === "SE") { d.orientation = "CUSTOM"; d.azimuthDeg = 45; }
    if (orient === "SW") { d.orientation = "CUSTOM"; d.azimuthDeg = 315; }
    if (orient === "SOUTH") d.azimuthDeg = 0;
    if (orient === "EAST") d.azimuthDeg = 90;
    d.wall.materialId = wallSys.materialId;
    d.wall.thicknessMm = wallSys.thicknessMm;
    d.wall.insulationMaterialId = d.wall.insulationMaterialId || "ins_puf";
    d.wall.insulationThicknessMm = wallSys.insulationThicknessMm;
    d.roof.materialId = roofSys.materialId;
    d.roof.thicknessMm = roofSys.thicknessMm;
    d.roof.insulationMaterialId = d.roof.insulationMaterialId || "ins_puf";
    d.roof.insulationThicknessMm = roofSys.insulationThicknessMm;
    const geom0 = computeGeometry(d);
    const targetWindowArea = geom0.wallArea * wpct;
    d.windows = [{ areaEach: round2(targetWindowArea), count: 1, orientation: "FRONT", glazingMaterialId: glz }];
    d.thermalMass = massOpt
      ? { materialId: massOpt.materialId, massKg: massOpt.massKg, surfaceAreaM2: Math.min(geom0.floorArea, massOpt.massKg / 300) }
      : null;
    return {
      design: d,
      params: {
        orient, insul: wallSys.insulationThicknessMm, wpct, glz, mass: massOpt ? massOpt.massKg : 0,
        wall: wallSys.materialId, roof: roofSys.materialId, massMat: massOpt ? massOpt.materialId : null
      }
    };
  }

  function massOptionByMaterialId(materialId) {
    return MASS_OPTIONS.find(m => m && m.materialId === materialId) || null;
  }

  // Snap baseDesign's own current orientation/window%/glazing/mass onto the
  // option sets below, so Stage 1 searches wall x roof against what the
  // shelter actually has right now, not an arbitrary index-derived tuple.
  function currentOrientationKey(baseDesign) {
    const az = frontAzimuthOf(baseDesign);
    const options = [["SOUTH", 0], ["SE", 45], ["EAST", 90], ["SW", 315]];
    return options.reduce((best, opt) => {
      const diff = Math.min(Math.abs(az - opt[1]), 360 - Math.abs(az - opt[1]));
      const bestDiff = Math.min(Math.abs(az - best[1]), 360 - Math.abs(az - best[1]));
      return diff < bestDiff ? opt : best;
    }, options[0])[0];
  }
  function currentWindowPctOf(baseDesign) {
    const geom = computeGeometry(baseDesign);
    const windowArea = (baseDesign.windows || []).reduce((s, w) => s + (w.areaEach || 0) * (w.count || 0), 0);
    const raw = geom.wallArea > 0 ? windowArea / geom.wallArea : 0.12;
    return SECONDARY_WINDOW_PCT.reduce((a, b) => Math.abs(b - raw) < Math.abs(a - raw) ? b : a);
  }
  function currentGlazingOf(baseDesign) {
    const glz = baseDesign.windows && baseDesign.windows[0] && baseDesign.windows[0].glazingMaterialId;
    return SECONDARY_GLAZINGS.includes(glz) ? glz : "glaze_double";
  }
  function currentMassOptionOf(baseDesign) {
    if (!baseDesign.thermalMass || !baseDesign.thermalMass.massKg) return null;
    return massOptionByMaterialId(baseDesign.thermalMass.materialId) || MASS_OPTIONS[1];
  }

  // Stage 1: envelope axis, wall x roof (10 x 6 = 60).
  function buildEnvelopeCandidates(baseDesign) {
    const orient = currentOrientationKey(baseDesign);
    const wpct = currentWindowPctOf(baseDesign);
    const glz = currentGlazingOf(baseDesign);
    const massOpt = currentMassOptionOf(baseDesign);
    const out = [];
    WALL_SYSTEMS.forEach(wallSys => ROOF_SYSTEMS.forEach(roofSys => {
      out.push({ wallSys, roofSys, candidate: buildCandidate(baseDesign, wallSys, roofSys, orient, wpct, glz, massOpt) });
    }));
    return out;
  }

  // Stage 2/3: secondary axis, orientation x window% x glazing x mass
  // (4 x 4 x 4 x 7 = 448), at one fixed envelope.
  function buildSecondaryCandidates(baseDesign, wallSys, roofSys) {
    const out = [];
    SECONDARY_ORIENTATIONS.forEach(orient => SECONDARY_WINDOW_PCT.forEach(wpct =>
      SECONDARY_GLAZINGS.forEach(glz => MASS_OPTIONS.forEach(massOpt => {
        out.push(buildCandidate(baseDesign, wallSys, roofSys, orient, wpct, glz, massOpt));
      }))));
    return out;
  }

  // Staged block-coordinate-ascent search, replacing a single flat 60-
  // candidate grid that coupled orientation/window%/glazing/mass to the
  // wall x roof loop index (so a given envelope was only ever tested with
  // one arbitrary secondary combo — never "this envelope, but a better
  // orientation"). Each stage is exhaustive within what it varies, so the
  // result is provably non-decreasing versus the old flat grid — nothing
  // evaluated is ever discarded, only what to explore next is staged:
  //   Stage 1 — wall x roof (60), secondary pinned to baseDesign's own
  //             current settings.
  //   Stage 2 — full secondary cross-product (448) for the Stage 1 winner.
  //   Stage 3 — re-open the envelope axis (remaining 59 pairs) against the
  //             best secondary combo found in Stage 1+2, so a Stage-1
  //             finalist chosen under baseDesign's secondary settings isn't
  //             the final word if a different envelope wins once paired
  //             with the true best secondary combo.
  // 567 total candidates (60 + 448 + 59), benchmarked ~80-100ms (24H-7day
  // config, warm V8) — comfortably fast even before the ML-screened
  // "Broader search" option below.
  function generateCandidates(baseDesign, season, simConfig, weights) {
    function evaluate(c) {
      const result = runSimulation(c.design, season, simConfig);
      // No optimization-candidate UI ever reads a per-candidate hourly
      // series (only the single baseline runSimulation() result is ever
      // charted) — dropping it keeps STORE.save()'s localStorage blob well
      // under quota at this candidate count (full series on all 567
      // candidates would run tens of MB on the 7-day option).
      delete result.series;
      const cost = estimateCost(c.design);
      return { ...c, result, cost };
    }
    function rangesOf(list) {
      const costs = list.map(e => e.cost);
      const demands = list.map(e => e.result.daily.heatingReqKwh + e.result.daily.coolingReqKwh);
      return {
        cost: { min: Math.min(...costs), max: Math.max(...costs) },
        energy: { min: Math.min(...demands), max: Math.max(...demands) }
      };
    }
    function totalScore(e, r) { return scoreCandidate(e.result, e.cost, weights, r.cost, r.energy).total; }

    // ---- Stage 1: wall x roof @ baseDesign's current secondary params ----
    const stage1Pairs = buildEnvelopeCandidates(baseDesign);
    const stage1Zipped = stage1Pairs.map(p => ({ wallSys: p.wallSys, roofSys: p.roofSys, e: evaluate(p.candidate) }));
    const stage1 = stage1Zipped.map(z => z.e);

    const r1 = rangesOf(stage1);
    const finalists = stage1Zipped
      .map(z => ({ ...z, total: totalScore(z.e, r1) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, ENVELOPE_FINALISTS);

    // ---- Stage 2: full secondary grid per finalist envelope ----
    const stage2 = [];
    finalists.forEach(f => {
      buildSecondaryCandidates(baseDesign, f.wallSys, f.roofSys).forEach(c => stage2.push(evaluate(c)));
    });

    // ---- Stage 3: re-open the envelope axis at the best secondary combo
    // found so far (Stage 1+2 pooled) — skips the finalist pair(s) Stage 2
    // already covered.
    const pooled12 = [...stage1, ...stage2];
    const r12 = rangesOf(pooled12);
    const winner = pooled12.reduce((best, e) => {
      const t = totalScore(e, r12);
      return (!best || t > best.total) ? { e, total: t } : best;
    }, null).e;
    const winnerMassOpt = massOptionByMaterialId(winner.params.massMat);

    const stage3 = [];
    WALL_SYSTEMS.forEach(wallSys => ROOF_SYSTEMS.forEach(roofSys => {
      if (finalists.some(f => f.wallSys === wallSys && f.roofSys === roofSys)) return;
      stage3.push(evaluate(buildCandidate(
        baseDesign, wallSys, roofSys, winner.params.orient, winner.params.wpct, winner.params.glz, winnerMassOpt
      )));
    }));

    return [...stage1, ...stage2, ...stage3];
  }

  function scoreCandidate(result, cost, weights, costRange, energyRange) {
    const comfort = result.scores.comfortScore;
    const retention = result.scores.heatRetentionPct;
    const solar = result.scores.solarUtilizationPct;
    const energyDemand = result.daily.heatingReqKwh + result.daily.coolingReqKwh;
    energyRange = energyRange || { min: energyDemand * 0.7, max: energyDemand * 1.3 };
    const energyScore = energyRange.max > energyRange.min
      ? clamp(100 * (1 - (energyDemand - energyRange.min) / (energyRange.max - energyRange.min)), 0, 100)
      : 100;
    const costScore = costRange.max > costRange.min
      ? clamp(100 * (1 - (cost - costRange.min) / (costRange.max - costRange.min)), 0, 100)
      : 100;
    const total = weights.comfort * comfort + weights.retention * retention + weights.solar * solar +
      weights.energy * energyScore + weights.cost * costScore;
    return { comfort, retention, solar, energyScore, costScore, energyDemand, total: round2(total) };
  }

  // Broad, continuous-parameter candidate sampling for ML-surrogate
  // pre-screening (see surrogateScreen below). Unlike the grid stages above
  // (fixed WALL_SYSTEMS/ROOF_SYSTEMS thickness combos, 4 named orientations),
  // wall/roof thickness and insulation, window%, and mass amount are sampled
  // continuously — the same ranges the offline trainer draws from (see
  // tools/generate-training-data.js) — so this genuinely explores between
  // today's fixed grid points, not just a re-shuffling of them.
  function randomBroadCandidate(baseDesign) {
    const wallMat = pick(DATA.materialsByCategory("WALL"));
    const roofMat = pick(DATA.materialsByCategory("ROOF"));
    const wallSys = { materialId: wallMat.id, thicknessMm: Math.round(uniformBetween(50, 400)), insulationThicknessMm: Math.round(uniformBetween(0, 150)) };
    const roofSys = { materialId: roofMat.id, thicknessMm: Math.round(uniformBetween(50, 250)), insulationThicknessMm: Math.round(uniformBetween(0, 150)) };
    const orient = pick(SECONDARY_ORIENTATIONS);
    const wpct = uniformBetween(0.04, 0.35);
    const glz = pick(SECONDARY_GLAZINGS);
    const massOpt = Math.random() < 0.15 ? null : (() => {
      const m = pick(MASS_OPTIONS.filter(Boolean));
      return { materialId: m.materialId, massKg: Math.round(uniformBetween(200, 2000)) };
    })();
    return buildCandidate(baseDesign, wallSys, roofSys, orient, wpct, glz, massOpt);
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function uniformBetween(min, max) { return min + Math.random() * (max - min); }

  // ML-surrogate pre-screening: score N broadly-sampled candidates with the
  // fast trained surrogate (window.APP_ML, see ml-surrogate.js — trained
  // offline on this app's own physics engine output, never field data),
  // keep only the top K by surrogate score, and hand those K back to the
  // caller for REAL physics verification. The surrogate's own predictions
  // and the N-broad pool are discarded here and never returned — physics
  // stays authoritative by construction: every candidate that reaches
  // runOptimization's output has a real runSimulation() result backing it,
  // exactly like the grid-search path.
  function surrogateScreen(baseDesign, season, weights, N, K) {
    const ML = window.APP_ML;
    const broad = [];
    for (let i = 0; i < N; i++) broad.push(randomBroadCandidate(baseDesign));
    const scored = broad.map(c => ({ c, cost: estimateCost(c.design), pred: ML.predict(c.design, season) }));
    const costs = scored.map(s => s.cost);
    const costRange = { min: Math.min(...costs), max: Math.max(...costs) };
    const demands = scored.map(s => s.pred.energyDemandKwhPerDay);
    const energyRange = { min: Math.min(...demands), max: Math.max(...demands) };
    scored.forEach(s => {
      // Reuses scoreCandidate's exact weighting/normalization formula via a
      // minimal result-shaped wrapper around the surrogate's predictions —
      // zero duplicated math between the real and surrogate-screening paths.
      const fakeResult = {
        scores: { comfortScore: s.pred.comfortScore, heatRetentionPct: s.pred.heatRetentionPct, solarUtilizationPct: s.pred.solarUtilizationPct },
        daily: { heatingReqKwh: Math.max(0, s.pred.energyDemandKwhPerDay), coolingReqKwh: 0 }
      };
      s.surrogateTotal = scoreCandidate(fakeResult, s.cost, weights, costRange, energyRange).total;
    });
    scored.sort((a, b) => b.surrogateTotal - a.surrogateTotal);
    return scored.slice(0, K).map(s => s.c);
  }

  function runOptimization(baseDesign, season, simConfig, weights, opts) {
    opts = opts || {};
    let evaluated;
    const usedMlScreening = !!(opts.broaderSearch && window.APP_ML && window.APP_ML.isAvailable());
    const broadN = opts.n || 10000;
    if (usedMlScreening) {
      const K = opts.k || 400;
      const shortlist = surrogateScreen(baseDesign, season, weights, broadN, K);
      evaluated = shortlist.map(c => {
        const result = runSimulation(c.design, season, simConfig);
        delete result.series; // see generateCandidates' evaluate() — same localStorage-quota reasoning
        return { ...c, result, cost: estimateCost(c.design) };
      });
    } else {
      evaluated = generateCandidates(baseDesign, season, simConfig, weights);
    }
    const costs = evaluated.map(e => e.cost);
    const costRange = { min: Math.min(...costs), max: Math.max(...costs) };
    const demands = evaluated.map(e => e.result.daily.heatingReqKwh + e.result.daily.coolingReqKwh);
    const energyRange = { min: Math.min(...demands), max: Math.max(...demands) };
    evaluated.forEach(e => { e.score = scoreCandidate(e.result, e.cost, weights, costRange, energyRange); });
    evaluated.sort((a, b) => b.score.total - a.score.total);
    evaluated.forEach((e, i) => { e.rank = i + 1; });
    const top = evaluated.slice(0, 5);
    const labels = ["A", "B", "C", "D", "E"];
    top.forEach((e, i) => { e.label = labels[i]; e.isRecommended = i === 0; });
    return {
      candidatesEvaluated: evaluated.length, top, recommended: top[0], all: evaluated,
      usedMlScreening, mlScreenedFrom: usedMlScreening ? broadN : null
    };
  }

  function sensitivityAnalysis(baseDesign, season, simConfig, weights) {
    const baseResult = runSimulation(baseDesign, season, simConfig);
    const baseCost = estimateCost(baseDesign);
    const baseScore = scoreCandidate(baseResult, baseCost, weights, { min: baseCost * 0.7, max: baseCost * 1.3 }).total;

    const perturbations = [
      { key: "Insulation thickness", apply: d => { d.wall.insulationThicknessMm = (d.wall.insulationThicknessMm || 75) + 50; d.roof.insulationThicknessMm = (d.roof.insulationThicknessMm || 75) + 50; } },
      { key: "Orientation", apply: d => { d.orientation = "SOUTH"; d.azimuthDeg = 0; } },
      { key: "Window area", apply: d => { (d.windows || []).forEach(w => w.areaEach *= 1.5); } },
      { key: "Thermal mass", apply: d => { d.thermalMass = { materialId: "mass_composite", massKg: 1200, surfaceAreaM2: 6 }; } },
      { key: "Wall material", apply: d => { d.wall.materialId = "wall_composite"; } },
      { key: "Glazing type", apply: d => { (d.windows || []).forEach(w => w.glazingMaterialId = "glaze_triple"); } },
      { key: "Shelter volume", apply: d => { d.height = (d.height || 3) * 1.15; } }
    ];

    const impacts = perturbations.map(p => {
      const d = cloneDesign(baseDesign);
      p.apply(d);
      const result = runSimulation(d, season, simConfig);
      const cost = estimateCost(d);
      const score = scoreCandidate(result, cost, weights, { min: cost * 0.7, max: cost * 1.3 }).total;
      return { parameter: p.key, deltaScore: round2(score - baseScore) };
    }).sort((a, b) => Math.abs(b.deltaScore) - Math.abs(a.deltaScore));

    return { baseScore: round2(baseScore), impacts };
  }

  // ---- Window placement recommendation --------------------------------
  // Not a fixed rule table ("south is always best") — that breaks down in
  // a hot climate where more solar gain is the opposite of what's wanted.
  // Instead this actually simulates a handful of candidate face
  // distributions for the SAME total window area/glazing the design
  // already has (so it's a placement comparison, not "add more window"),
  // via the same runSimulation() + thermalComfortScore the rest of the
  // app already treats as the headline number — consistent with how
  // runOptimization() picks a winner, just scoped to one parameter.
  function recommendWindowLayout(design, season, simConfig) {
    if (!season) return null;
    const geom = computeGeometry(design, season.latitude);
    const groups = design.windows || [];
    const totalArea = groups.reduce((s, w) => s + (w.areaEach || 0) * (w.count || 0), 0);
    const totalCount = groups.reduce((s, w) => s + (w.count || 0), 0);
    if (!(totalArea > 0)) return null;
    const typicalSize = totalCount > 0 ? totalArea / totalCount : 1.2;
    const glazingMaterialId = (groups[0] && groups[0].glazingMaterialId) || "glaze_double";

    const OFFSETS = { FRONT: 0, BACK: 180, LEFT: -90, RIGHT: 90 };
    const ranked = Object.keys(OFFSETS)
      .map(face => ({ face, factor: faceFactor(geom.frontAzimuth, OFFSETS[face], season.latitude) }))
      .sort((a, b) => b.factor - a.factor);
    const [best, second, third] = ranked;

    // Splits a target total area across faces into realistically-sized
    // window groups (rather than one giant window), using the design's
    // own existing average window size as the yardstick.
    function toGroups(shares) {
      return shares.filter(s => s.area > 0.05).map(s => {
        const count = Math.max(1, Math.round(s.area / typicalSize));
        return { areaEach: round2(s.area / count), count, orientation: s.face, glazingMaterialId };
      });
    }

    const candidates = [
      { label: "Current layout", groups: groups.map(w => ({ ...w })) },
      { label: `All on ${best.face}`, groups: toGroups([{ face: best.face, area: totalArea }]) },
      { label: `${best.face} + ${second.face} split`, groups: toGroups([{ face: best.face, area: totalArea * 0.7 }, { face: second.face, area: totalArea * 0.3 }]) },
      { label: `Spread across ${best.face}/${second.face}/${third.face}`, groups: toGroups([{ face: best.face, area: totalArea / 3 }, { face: second.face, area: totalArea / 3 }, { face: third.face, area: totalArea / 3 }]) }
    ];

    const evaluated = candidates.map(c => {
      const d = cloneDesign(design);
      d.windows = c.groups;
      let result;
      try { result = runSimulation(d, season, simConfig); } catch (e) { return null; }
      return { label: c.label, groups: c.groups, score: result.scores.thermalComfortScore };
    }).filter(Boolean);
    if (!evaluated.length) return null;

    const current = evaluated.find(e => e.label === "Current layout");
    const ranked2 = [...evaluated].sort((a, b) => b.score - a.score);
    return { current, best: ranked2[0], all: ranked2 };
  }

  // ---- Validation stats ----------------------------------------------------
  function validationStats(points) {
    // points: [{measured, predicted}]
    const n = points.length;
    if (n === 0) return null;
    const errs = points.map(p => p.predicted - p.measured);
    const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / n;
    const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / n);
    const mape = points.reduce((s, p) => s + Math.abs((p.predicted - p.measured) / (p.measured || 1e-6)), 0) / n * 100;
    const meanMeasured = points.reduce((s, p) => s + p.measured, 0) / n;
    const ssTot = points.reduce((s, p) => s + Math.pow(p.measured - meanMeasured, 2), 0);
    const ssRes = points.reduce((s, p) => s + Math.pow(p.measured - p.predicted, 2), 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
    return { mae: round2(mae), rmse: round2(rmse), mape: round2(mape), r2: r2 !== null ? Math.round(r2 * 1000) / 1000 : null, n };
  }

  // ---- Annual / seasonal energy balance -----------------------------------
  // Aggregates 4 representative-day simulations (one per meteorological
  // season, built from the location's monthly climate normals) rather than
  // a full 365-day hourly run -- for a steady-state passive-design
  // comparison this is standard practice and far cheaper than a full year
  // at this engine's 15-60 min resolution. Client-side/exploratory, same
  // bucket as sensitivityAnalysis/recommendWindowLayout below -- not
  // persisted as an "official" backend result, and runSimulation itself is
  // untouched (called 4 times, not modified).
  const SEASON_MONTH_IDX = { DJF: [11, 0, 1], MAM: [2, 3, 4], JJA: [5, 6, 7], SON: [8, 9, 10] };
  const SEASON_MID_DOY = { DJF: 15, MAM: 105, JJA: 196, SON: 288 };
  const SEASON_LABEL = { DJF: "Winter (Dec-Feb)", MAM: "Spring (Mar-May)", JJA: "Summer (Jun-Aug)", SON: "Autumn (Sep-Nov)" };

  // Cooper (1969) solar declination + standard hour-angle sunrise/sunset --
  // the same formula tools/generate-training-data.js already uses to build
  // its own seasonal contexts from monthly data, for the same reason.
  function dayLengthHours(latitude, dayOfYear) {
    const decl = 23.45 * Math.sin((2 * Math.PI / 365) * (284 + dayOfYear));
    const latRad = latitude * Math.PI / 180, declRad = decl * Math.PI / 180;
    const cosH = -Math.tan(latRad) * Math.tan(declRad);
    const clamped = Math.max(-1, Math.min(1, cosH));
    const hourAngleDeg = Math.acos(clamped) * 180 / Math.PI;
    return (2 * hourAngleDeg) / 15;
  }

  function avgOf(arr) {
    const v = arr.filter(x => Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  // Builds 4 representative-day season objects from monthly climate
  // normals. NASA POWER's climatology endpoint gives one mean temp per
  // month (season.monthlyTemp, already merged by store.js) and monthly GHI
  // (location.solarDataSource.monthlyGhi) but no monthly wind/humidity --
  // those two stay fixed at the base season's values for all 4 seasons,
  // which is honest (nothing to vary them with) rather than fabricated.
  // Falls back entirely to the flat base season when no monthly data was
  // ever fetched for this location (all 4 "seasons" then read identically).
  function buildSeasonalContexts(location, season) {
    const monthlyTemp = season.monthlyTemp;
    const monthlyGhi = location && location.solarDataSource && location.solarDataSource.monthlyGhi;
    const latitude = season.latitude;
    const swing = (season.tMax - season.tMin) / 2;
    return Object.keys(SEASON_MONTH_IDX).map(key => {
      const idx = SEASON_MONTH_IDX[key];
      const tMeanMonthly = Array.isArray(monthlyTemp) ? avgOf(idx.map(i => monthlyTemp[i] && monthlyTemp[i].tempC)) : null;
      const tMean = tMeanMonthly != null ? tMeanMonthly : (season.tMin + season.tMax) / 2;
      const ghiAvg = Array.isArray(monthlyGhi) ? avgOf(idx.map(i => monthlyGhi[i] && monthlyGhi[i].kwhM2Day)) : null;
      const daylight = Number.isFinite(latitude) ? dayLengthHours(latitude, SEASON_MID_DOY[key]) : (season.sunset - season.sunrise);
      return {
        label: SEASON_LABEL[key], seasonKey: key, latitude,
        tMin: tMean - swing, tMax: tMean + swing,
        solarKwhDay: ghiAvg != null ? ghiAvg : season.solarKwhDay,
        sunrise: 12 - daylight / 2, sunset: 12 + daylight / 2,
        windMs: season.windMs, rhPct: season.rhPct, cloudPct: season.cloudPct,
        avgTempCAnnual: season.avgTempCAnnual, monthlyTemp: season.monthlyTemp
      };
    });
  }

  // Runs runSimulation once per representative season and aggregates into
  // an annual energy balance. runSimulation's `daily`/`comfort`/`scores`
  // figures are already per-simulated-day averages regardless of
  // simConfig.days, so each season's share of the year (365/4 days) is
  // applied once here, not per input day.
  function runAnnualSimulation(design, location, season, simConfig) {
    const DAYS_PER_SEASON = 365 / 4;
    const seasons = buildSeasonalContexts(location, season).map(ctx => {
      const result = runSimulation(design, ctx, simConfig);
      return {
        seasonKey: ctx.seasonKey, label: ctx.label,
        avgIndoorC: result.comfort.avgIndoor, minIndoorC: result.comfort.minIndoor, maxIndoorC: result.comfort.maxIndoor,
        comfortHoursPerDay: result.comfort.comfortHoursPerDay, inBandPct: result.comfort.inBandPct,
        heatingReqKwhPerDay: result.daily.heatingReqKwh, coolingReqKwhPerDay: result.daily.coolingReqKwh,
        solarUtilizationPct: result.scores.solarUtilizationPct, thermalComfortScore: result.scores.thermalComfortScore,
        result
      };
    });
    const sumOverYear = key => seasons.reduce((sum, s) => sum + (s[key] || 0) * DAYS_PER_SEASON, 0);
    const avgAcrossSeasons = key => seasons.reduce((sum, s) => sum + (s[key] || 0), 0) / seasons.length;
    return {
      seasons,
      annual: {
        totalHeatingKwh: round2(sumOverYear("heatingReqKwhPerDay")),
        totalCoolingKwh: round2(sumOverYear("coolingReqKwhPerDay")),
        avgComfortHoursPerDay: round2(avgAcrossSeasons("comfortHoursPerDay")),
        avgInBandPct: round2(avgAcrossSeasons("inBandPct")),
        avgSolarUtilizationPct: round2(avgAcrossSeasons("solarUtilizationPct")),
        avgThermalComfortScore: round2(avgAcrossSeasons("thermalComfortScore"))
      }
    };
  }

  return {
    computeGeometry, wallUValue, roofUValue, floorUValue, windowUValue,
    ambientTempAt, solarIrradianceAt, windSpeedAt, runSimulation, estimateCost, estimateCostBreakdown,
    computeOccupancyHeat, occupancyAchIncrement,
    windAdjustedInfiltrationAch, ventUAFromAch,
    windAdjustedFilmCoefficient, estimateGroundTempC, massFilmCoefficient,
    generateCandidates, scoreCandidate, runOptimization, sensitivityAnalysis, recommendWindowLayout,
    validationStats, validateDesign, validateCoordinates,
    orientationFactorFromAngle, faceFactor, frontAzimuthOf, orientationFactorTableForLatitude,
    runAnnualSimulation
  };
})();
