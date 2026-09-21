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
  const RSI_WALL = 0.13, RSI_ROOF = 0.10, R_GROUND = 0.50;

  // Orientation offset-from-south (deg), used for the piecewise factor table.
  const ORIENT_OFFSET = { SOUTH: 0, SE: 45, EAST: 90, NE: 135, NORTH: 180, NW: 135, WEST: 90, SW: 45 };
  const FACTOR_TABLE = [ [0, 1.00], [45, 0.85], [90, 0.55], [135, 0.30], [180, 0.15] ];

  function orientationFactorFromAngle(angle0to180) {
    const a = Math.max(0, Math.min(180, angle0to180));
    for (let i = 0; i < FACTOR_TABLE.length - 1; i++) {
      const [a0, f0] = FACTOR_TABLE[i], [a1, f1] = FACTOR_TABLE[i + 1];
      if (a >= a0 && a <= a1) {
        const t = (a - a0) / (a1 - a0);
        return f0 + t * (f1 - f0);
      }
    }
    return 0.15;
  }

  function frontAzimuthOf(design) {
    if (design.orientation === "CUSTOM") return ((design.azimuthDeg % 360) + 360) % 360;
    return ORIENT_OFFSET[design.orientation] ?? 0;
  }

  function faceFactor(frontAzimuth, relativeOffsetDeg) {
    const abs = ((frontAzimuth + relativeOffsetDeg) % 360 + 360) % 360;
    const angle = abs <= 180 ? abs : 360 - abs;
    return orientationFactorFromAngle(angle);
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
  function computeGeometry(design) {
    let L = design.length || 6, W = design.width || 4, H = design.height || 3;
    let floorArea, roofArea, perimeter;
    const isRound = design.shape === "CIRCULAR" || design.shape === "DOME" || design.shape === "SEMI_CIRCULAR";
    const isLShape = design.shape === "L_SHAPE";
    if (isRound) {
      const d = design.diameter || Math.max(L, W) || 5;
      const r = d / 2;
      floorArea = Math.PI * r * r;
      perimeter = Math.PI * d;
      roofArea = (design.shape === "DOME") ? 2 * Math.PI * r * r : floorArea;
      L = W = d;
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
      faces = [{ name: "CURVED_WALL", areaM2: wallArea, factor: faceFactor(frontAzimuth, 0) }];
    } else if (isLShape) {
      const wallArea = perimeter * H;
      faces = [{ name: "L_WALL", areaM2: wallArea, factor: faceFactor(frontAzimuth, 0) }];
    } else {
      faces = [
        { name: "FRONT", areaM2: L * H, factor: faceFactor(frontAzimuth, 0) },
        { name: "BACK", areaM2: L * H, factor: faceFactor(frontAzimuth, 180) },
        { name: "LEFT", areaM2: W * H, factor: faceFactor(frontAzimuth, -90) },
        { name: "RIGHT", areaM2: W * H, factor: faceFactor(frontAzimuth, 90) }
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

  // ---- Core hourly simulation --------------------------------------------
  // design: see data model in ARCHITECTURE.md / store.js
  // climate: { season: {tMin,tMax,solarKwhDay,sunrise,sunset,windMs,rhPct}, latitude }
  // simConfig: { timeStepMinutes, days }
  function runSimulation(design, season, simConfig) {
    const geom = computeGeometry(design);
    const uWall = wallUValue(design), uRoof = roofUValue(design), uFloor = floorUValue(design);
    const windowGroups = (design.windows || []).map(w => ({
      ...w, uValue: windowUValue(w), shgc: (DATA.materialById(w.glazingMaterialId) || {}).shgc || 0.7,
      totalArea: (w.areaEach || 0) * (w.count || 0)
    }));
    const doorArea = (design.doors || []).reduce((s, d) => s + (d.areaEach || 0) * (d.count || 0), 0);
    const windowArea = windowGroups.reduce((s, w) => s + w.totalArea, 0);
    const netWallArea = Math.max(0, geom.wallArea - windowArea - doorArea);

    const occ = computeOccupancyHeat(design);
    const infiltrationAch = windAdjustedInfiltrationAch(design, season);
    const occupancyAch = occupancyAchIncrement(occ.persons, geom.volume);
    const ach = infiltrationAch + occupancyAch;
    // Constant for the whole run (don't depend on the timestep) — hoisted
    // out of the hourly loop below rather than recomputed every iteration.
    const infiltrationUA = ventUAFromAch(infiltrationAch, geom.volume);
    const occupancyVentUA = ventUAFromAch(occupancyAch, geom.volume);
    const ventUA = infiltrationUA + occupancyVentUA;

    const tm = design.thermalMass;
    let massActive = !!(tm && tm.massKg > 0);
    const massMat = massActive ? DATA.materialById(tm.materialId) : null;
    let cMass = massActive ? tm.massKg * (massMat.cp || 900) : 0;
    const massArea = massActive ? (tm.surfaceAreaM2 || 5) : 0;
    const isPcm = massActive && massMat && massMat.pcmMeltC != null;

    const cAir = geom.volume * AIR_RHO * AIR_CP * CFG.PHYSICS.FURNISHING_CAPACITANCE_FACTOR;

    // Material lookups are constant for the whole run — hoisted out of the
    // hourly loop below rather than re-looked-up every iteration.
    const wallMat = DATA.materialById(design.wall.materialId) || { absorptivity: 0.6 };
    const roofMat = DATA.materialById(design.roof.materialId) || { absorptivity: 0.6 };

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

      // Sol-air temps per face (opaque) — wallMat/roofMat hoisted above the loop
      let wallUA = 0, wallRefSum = 0;
      geom.faces.forEach(f => {
        const gFace = gHoriz * f.factor;
        const tSolAir = tAmb + (wallMat.absorptivity * gFace) / H_O;
        wallUA += uWall * f.areaM2;
        wallRefSum += uWall * f.areaM2 * tSolAir;
      });
      const tSolAirRoof = tAmb + (roofMat.absorptivity * gHoriz) / H_O;
      const roofUA = uRoof * geom.roofArea, roofRef = roofUA * tSolAirRoof;
      const tGround = design.groundTempC ?? (season.tMin + season.tMax) / 2;
      const floorUA = uFloor * geom.floorArea, floorRef = floorUA * tGround;

      let qSolarWindow = 0, windowCondUA = 0;
      windowGroups.forEach(w => {
        const off = { FRONT: 0, BACK: 180, LEFT: -90, RIGHT: 90, PRIMARY: 0 }[w.orientation] ?? 0;
        const f = faceFactor(geom.frontAzimuth, off);
        qSolarWindow += w.totalArea * gHoriz * f * w.shgc;
        windowCondUA += w.uValue * w.totalArea;
      });
      const windowCondRef = windowCondUA * tAmb;
      const doorUA = 1.8 * doorArea, doorRef = doorUA * tAmb; // typical insulated door U~1.8 W/m2K, documented assumption
      const ventRef = ventUA * tAmb; // ventUA (infiltration + occupancy) hoisted above the loop — constant for the run
      const qInternal = occ.totalSensibleW; // sensible-only: occupant sensible share + equipment gain
      const massUA = massActive ? H_MASS * massArea : 0, massRef = massUA * tMass;

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

    const comfortScore = clamp(0.5 * dayComfortPct + 0.5 * nightComfortPct, 0, 100);
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
    if (occ.persons > 0) {
      occupancyNote = netOccupancyEffectKwh <= 0.05
        ? `Ventilation increase from ${occ.persons} occupant(s) offsets most or all of their body-heat gain (net ${netOccupancyEffectKwh >= 0 ? "+" : ""}${netOccupancyEffectKwh} kWh/day) — a modelled trade-off, not an error.`
        : `Occupants add more sensible heat than the occupancy-linked ventilation removes (net +${netOccupancyEffectKwh} kWh/day).`;
    }

    return {
      geometry: geom, uValues: { wall: uWall, roof: uRoof, floor: uFloor },
      netWallArea, windowArea, doorArea, series,
      ach: { infiltration: round2(infiltrationAch), occupancy: round2(occupancyAch), total: round2(ach) },
      occupancy: {
        persons: occ.persons, activityLabel: occ.activity.label, totalW: round2(occ.totalW),
        sensibleW: round2(occ.sensibleW), latentW: round2(occ.latentW), equipmentW: round2(occ.equipmentW),
        latentKgPerHour: Math.round(occ.latentKgPerHour * 1000) / 1000,
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
        avgIndoor: avgIndoor
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
  const MASS_OPTIONS = [
    null,
    { materialId: "mass_stone", massKg: 900 }, { materialId: "mass_water", massKg: 900 },
    { materialId: "mass_pcm", massKg: 400 }, { materialId: "mass_composite", massKg: 900 },
    { materialId: "mass_earth", massKg: 1600 }
  ];

  function generateCandidates(baseDesign) {
    const orientations = ["SOUTH", "SE", "SW", "EAST"];
    const windowPct = [0.08, 0.12, 0.16, 0.20];
    const glazings = ["glaze_single", "glaze_double", "glaze_triple", "glaze_lowe"];

    // Wall x roof material is the primary axis (10 x 6 = 60, one candidate
    // per material combination, guaranteeing every wall/roof pairing is
    // actually evaluated). Orientation/window%/glazing/thermal-mass cycle
    // across that same 60-candidate sequence via coprime-ish offsets so the
    // secondary parameters still vary — not locked to a single value — but
    // don't need a full nested cross-product to do it.
    const candidates = [];
    let idx = 0;
    for (const wallSys of WALL_SYSTEMS) {
      for (const roofSys of ROOF_SYSTEMS) {
        const orient = orientations[idx % orientations.length];
        const wpct = windowPct[(idx + 1) % windowPct.length];
        const glz = glazings[(idx + 2) % glazings.length];
        const massOpt = MASS_OPTIONS[idx % MASS_OPTIONS.length];
        idx++;

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
        if (massOpt) {
          d.thermalMass = { materialId: massOpt.materialId, massKg: massOpt.massKg, surfaceAreaM2: Math.min(geom0.floorArea, massOpt.massKg / 300) };
        } else {
          d.thermalMass = null;
        }
        candidates.push({
          design: d,
          params: {
            orient, insul: wallSys.insulationThicknessMm, wpct, glz, mass: massOpt ? massOpt.massKg : 0,
            wall: wallSys.materialId, roof: roofSys.materialId, massMat: massOpt ? massOpt.materialId : null
          }
        });
      }
    }
    return candidates;
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

  function runOptimization(baseDesign, season, simConfig, weights) {
    const rawCandidates = generateCandidates(baseDesign);
    const evaluated = rawCandidates.map(c => {
      const result = runSimulation(c.design, season, simConfig);
      const cost = estimateCost(c.design);
      return { ...c, result, cost };
    });
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
    return { candidatesEvaluated: evaluated.length, top, recommended: top[0], all: evaluated };
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

  return {
    computeGeometry, wallUValue, roofUValue, floorUValue, windowUValue,
    ambientTempAt, solarIrradianceAt, runSimulation, estimateCost,
    computeOccupancyHeat, occupancyAchIncrement,
    windAdjustedInfiltrationAch, ventUAFromAch,
    generateCandidates, scoreCandidate, runOptimization, sensitivityAnalysis,
    validationStats, validateDesign, validateCoordinates,
    orientationFactorFromAngle, faceFactor, frontAzimuthOf
  };
})();
