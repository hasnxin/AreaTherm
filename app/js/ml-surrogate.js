/* AreaTherm — ML surrogate inference (dependency-free, client-side).
   Evaluates the gradient-boosted trees in ml-model-data.js (trained offline
   — see tools/train-ml-surrogate.js) against a candidate design. Used ONLY
   to pre-screen a broad candidate pool before Optimization's "Broader
   search" — every design actually shown anywhere in this app is always
   verified by a real ENGINE.runSimulation() call; this module's output
   never reaches a stored or displayed result. See engine.js's
   generateCandidates(opts.broaderSearch) for the integration point, and
   Settings -> "ML Surrogate" for the accuracy this was measured at against
   the app's own physics engine (not a real-world accuracy claim). */

window.APP_ML = (function () {
  // Read lazily inside each function body, not captured here — this file
  // loads before engine.js in index.html (grouped with the other static
  // data files), so window.APP_ENGINE/APP_DATA don't exist yet at the
  // moment this IIFE itself runs.

  function isAvailable() {
    return !!(window.APP_ML_MODEL && window.APP_ML_MODEL.models);
  }

  function evalTree(nodes, rootIdx, x) {
    let node = nodes[rootIdx];
    while (node[0] === 0) { // [0, feature, threshold, leftIdx, rightIdx]
      node = x[node[1]] <= node[2] ? nodes[node[3]] : nodes[node[4]];
    }
    return node[1]; // [1, value]
  }
  function evalBooster(booster, x) {
    let pred = booster.f0;
    for (const nodes of booster.trees) pred += booster.learningRate * evalTree(nodes, 0, x);
    return pred;
  }

  // Same 23 features the offline trainer extracts — must stay in lockstep
  // with tools/train-ml-surrogate.js's FEATURE_NAMES / extractFeatures().
  function extractFeatureVector(design, season) {
    const ENGINE = window.APP_ENGINE, DATA = window.APP_DATA;
    const model = window.APP_ML_MODEL;
    const geom = ENGINE.computeGeometry(design, season.latitude);
    const wallMat = DATA.materialById(design.wall.materialId);
    const roofMat = DATA.materialById(design.roof.materialId);
    const glz = DATA.materialById(design.windows[0].glazingMaterialId);
    const windowArea = design.windows.reduce((s, w) => s + w.areaEach * w.count, 0);
    const occ = ENGINE.computeOccupancyHeat(design);
    const orientFactor = ENGINE.faceFactor(ENGINE.frontAzimuthOf(design), 0, season.latitude);
    const featureValues = {
      U_wall: ENGINE.wallUValue(design), alpha_wall: wallMat.absorptivity,
      U_roof: ENGINE.roofUValue(design), alpha_roof: roofMat.absorptivity,
      orientationFactor: orientFactor,
      windowWallRatioPct: geom.wallArea > 0 ? windowArea / geom.wallArea : 0,
      U_window: glz.uValue, SHGC: glz.shgc,
      massKg: design.thermalMass ? design.thermalMass.massKg : 0,
      cp_mass: design.thermalMass ? (DATA.materialById(design.thermalMass.materialId).cp || 900) : 0,
      floorAreaM2: geom.floorArea, wallAreaM2: geom.wallArea, roofAreaM2: geom.roofArea, volumeM3: geom.volume,
      internalGainW: occ.totalSensibleW, airLeakageAch: design.airLeakageAch,
      tMinC: season.tMin, tMaxC: season.tMax, solarKwhDay: season.solarKwhDay,
      daylightHours: season.sunset - season.sunrise, windMs: season.windMs,
      latitude: season.latitude, avgTempCAnnual: season.avgTempCAnnual
    };
    return model.featureNames.map(f => featureValues[f]);
  }

  // Returns { comfortScore, heatRetentionPct, solarUtilizationPct, energyDemandKwhPerDay },
  // each a fast surrogate ESTIMATE — never displayed directly, only used to
  // rank a broad pool before the real physics-verified shortlist is chosen.
  function predict(design, season) {
    const model = window.APP_ML_MODEL;
    const x = extractFeatureVector(design, season);
    const out = {};
    model.targets.forEach(t => { out[t] = evalBooster(model.models[t], x); });
    return out;
  }

  function getAccuracyStats() {
    return window.APP_ML_MODEL ? window.APP_ML_MODEL.accuracy : null;
  }

  return { isAvailable, predict, getAccuracyStats, extractFeatureVector };
})();
