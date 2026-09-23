/* AreaTherm — ML surrogate training-data generator (dev-only, never shipped).
   Loads the REAL app engine (same harness pattern used all session for
   numeric verification) and runs it on many candidate designs across many
   climate contexts, recording (features -> physics-computed targets) rows.
   Every training LABEL comes from the app's own already-trusted
   runSimulation() — nothing here is fabricated or field-measured; only the
   INPUT sampling is synthetic, exactly like generateCandidates() already
   does at a smaller scale for the optimizer itself.

   Climate contexts: 4 seasonal contexts (DJF/MAM/JJA/SON) for each of the
   10 real reference locations, built from REAL NASA POWER climatology
   (same endpoint/parameters this app already fetches live in nasa-power.js,
   reused here via a plain Node https request) = 40 real contexts, plus 20
   interpolated contexts (convex combinations between pairs of real ones) so
   the model also covers climates between the 10 catalog points, for custom-
   coordinate generalization. Day length is derived from latitude + a
   representative day-of-year via the standard solar-declination/hour-angle
   formula (Cooper 1969) -- a well-established astronomical approximation,
   not fetched or fabricated data.

   Run: node tools/generate-training-data.js
   Output: tools/training-data.json */

const fs = require("fs");
const path = require("path");
const https = require("https");
const APP = path.join(__dirname, "..", "app", "js");

const window = {};
global.window = window;
function load(file) { new Function("window", fs.readFileSync(path.join(APP, file), "utf8"))(window); }
load("util.js");
load("config.js");
load("data.js");
load("engine.js");
const ENGINE = window.APP_ENGINE;
const DATA = window.APP_DATA;

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on("error", reject).on("timeout", function () { this.destroy(new Error("timeout")); });
  });
}

async function fetchNasaMonthly(lat, lon) {
  const url = "https://power.larc.nasa.gov/api/temporal/climatology/point" +
    "?parameters=ALLSKY_SFC_SW_DWN,T2M,T2M_MAX,T2M_MIN,WS2M,RH2M" +
    `&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  const j = await httpsGetJson(url);
  const p = j.properties.parameter;
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const sane = v => (typeof v === "number" && v > -900) ? v : null;
  return {
    ghi: MONTHS.map(m => sane(p.ALLSKY_SFC_SW_DWN[m])),
    tAvg: MONTHS.map(m => sane(p.T2M[m])),
    tMax: MONTHS.map(m => sane(p.T2M_MAX[m])),
    tMin: MONTHS.map(m => sane(p.T2M_MIN[m])),
    wind: MONTHS.map(m => sane(p.WS2M[m])),
    rh: MONTHS.map(m => sane(p.RH2M[m])),
    annTemp: sane(p.T2M.ANN)
  };
}

// Cooper (1969) solar declination + standard hour-angle sunrise/sunset.
function dayLengthHours(latitude, dayOfYear) {
  const decl = 23.45 * Math.sin((2 * Math.PI / 365) * (284 + dayOfYear));
  const latRad = latitude * Math.PI / 180, declRad = decl * Math.PI / 180;
  const cosH = -Math.tan(latRad) * Math.tan(declRad);
  const clamped = Math.max(-1, Math.min(1, cosH));
  const hourAngleDeg = Math.acos(clamped) * 180 / Math.PI;
  return (2 * hourAngleDeg) / 15; // hours
}

// Quarterly seasonal contexts from 12 monthly values: DJF/MAM/JJA/SON.
const SEASON_MONTH_IDX = { DJF: [11, 0, 1], MAM: [2, 3, 4], JJA: [5, 6, 7], SON: [8, 9, 10] };
const SEASON_MID_DOY = { DJF: 15, MAM: 105, JJA: 196, SON: 288 };
function avg(arr) { const v = arr.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

function buildContextsForLocation(loc, monthly) {
  return Object.keys(SEASON_MONTH_IDX).map(seasonKey => {
    const idx = SEASON_MONTH_IDX[seasonKey];
    const tMax = avg(idx.map(i => monthly.tMax[i]));
    const tMin = avg(idx.map(i => monthly.tMin[i]));
    const solarKwhDay = avg(idx.map(i => monthly.ghi[i]));
    const windMs = avg(idx.map(i => monthly.wind[i])) || 2;
    const rhPct = avg(idx.map(i => monthly.rh[i])) || 50;
    const daylight = dayLengthHours(loc.latitude, SEASON_MID_DOY[seasonKey]);
    return {
      label: `${loc.id}_${seasonKey}`, latitude: loc.latitude,
      tMin: tMin != null ? tMin : 10, tMax: tMax != null ? tMax : 25,
      solarKwhDay: solarKwhDay != null ? solarKwhDay : 4,
      sunrise: 12 - daylight / 2, sunset: 12 + daylight / 2,
      windMs, rhPct, cloudPct: 30, avgTempCAnnual: monthly.annTemp != null ? monthly.annTemp : 15
    };
  });
}

function interpolateContext(a, b, t, label) {
  const lerp = (x, y) => x + (y - x) * t;
  return {
    label, latitude: lerp(a.latitude, b.latitude),
    tMin: lerp(a.tMin, b.tMin), tMax: lerp(a.tMax, b.tMax),
    solarKwhDay: lerp(a.solarKwhDay, b.solarKwhDay),
    sunrise: lerp(a.sunrise, b.sunrise), sunset: lerp(a.sunset, b.sunset),
    windMs: lerp(a.windMs, b.windMs), rhPct: lerp(a.rhPct, b.rhPct), cloudPct: 30,
    avgTempCAnnual: lerp(a.avgTempCAnnual, b.avgTempCAnnual)
  };
}

// ---- Random design sampling ----------------------------------------------
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uniform(min, max) { return min + Math.random() * (max - min); }

const WALL_MATERIALS = DATA.materialsByCategory("WALL").map(m => m.id);
const ROOF_MATERIALS = DATA.materialsByCategory("ROOF").map(m => m.id);
const GLAZINGS = DATA.materialsByCategory("WINDOW").map(m => m.id);
const MASS_MATERIALS = DATA.materialsByCategory("THERMAL_MASS").map(m => m.id);
const ORIENTATIONS = ["SOUTH", "SE", "SW", "EAST", "NE", "NORTH", "NW", "WEST", "CUSTOM"];

function randomDesign() {
  const wallMat = pick(WALL_MATERIALS), roofMat = pick(ROOF_MATERIALS);
  const orient = pick(ORIENTATIONS);
  const hasMass = Math.random() > 0.15;
  const massMat = hasMass ? pick(MASS_MATERIALS) : null;
  const length = uniform(4, 10), width = uniform(3, 8), height = uniform(2.5, 3.5);
  return {
    name: "synthetic", shape: "RECTANGULAR", length: round2(length), width: round2(width), height: round2(height),
    orientation: orient === "CUSTOM" ? "CUSTOM" : orient,
    azimuthDeg: orient === "CUSTOM" ? Math.floor(uniform(0, 360)) : undefined,
    wall: { materialId: wallMat, thicknessMm: Math.round(uniform(50, 400)), insulationMaterialId: "ins_puf", insulationThicknessMm: Math.round(uniform(0, 150)) },
    roof: { materialId: roofMat, thicknessMm: Math.round(uniform(50, 250)), insulationMaterialId: "ins_puf", insulationThicknessMm: Math.round(uniform(0, 150)) },
    floor: { materialId: "wall_concrete", thicknessMm: 100 },
    windows: [{ areaEach: 1, count: 1, orientation: "FRONT", glazingMaterialId: pick(GLAZINGS) }], // areaEach set below via window%
    doors: [{ areaEach: 1.8, count: 1, orientation: "FRONT" }],
    airLeakageAch: round2(uniform(0.3, 1.5)),
    thermalMass: massMat ? { materialId: massMat, massKg: Math.round(uniform(200, 2000)), surfaceAreaM2: 5, exposure: "FLOOR" } : null,
    occupancy: Math.round(uniform(0, 6)), occupancyActivity: pick(["SEATED", "LIGHT", "HEAVY"]),
    internalHeatGainW: Math.round(uniform(50, 300)), groundTempC: null,
    comfort: { profileId: "human", baseMin: 15, max: 27, clothingLevel: "TYPICAL", activityLevel: "SEATED", min: 15 },
    __windowPct: uniform(0.04, 0.35)
  };
}
function round2(n) { return Math.round(n * 100) / 100; }

function finalizeDesign(d) {
  const geom = ENGINE.computeGeometry(d);
  d.windows[0].areaEach = round2(geom.wallArea * d.__windowPct);
  if (d.thermalMass) d.thermalMass.surfaceAreaM2 = round2(Math.min(geom.floorArea, d.thermalMass.massKg / 300));
  return d;
}

function extractFeatures(design, season) {
  const geom = ENGINE.computeGeometry(design, season.latitude);
  const wallMat = DATA.materialById(design.wall.materialId);
  const roofMat = DATA.materialById(design.roof.materialId);
  const glz = DATA.materialById(design.windows[0].glazingMaterialId);
  const windowArea = design.windows.reduce((s, w) => s + w.areaEach * w.count, 0);
  const occ = ENGINE.computeOccupancyHeat(design);
  const orientFactor = ENGINE.faceFactor(ENGINE.frontAzimuthOf(design), 0, season.latitude);
  return {
    U_wall: ENGINE.wallUValue(design), alpha_wall: wallMat.absorptivity,
    U_roof: ENGINE.roofUValue(design), alpha_roof: roofMat.absorptivity,
    orientationFactor: orientFactor,
    windowWallRatioPct: geom.wallArea > 0 ? windowArea / geom.wallArea : 0,
    U_window: glz.uValue, SHGC: glz.shgc,
    massKg: design.thermalMass ? design.thermalMass.massKg : 0,
    cp_mass: design.thermalMass ? (DATA.materialById(design.thermalMass.materialId).cp || 900) : 0,
    floorAreaM2: geom.floorArea, wallAreaM2: geom.wallArea, roofAreaM2: geom.roofArea, volumeM3: geom.volume,
    internalGainW: occ.totalSensibleW != null ? occ.totalSensibleW : occ.sensibleW,
    airLeakageAch: design.airLeakageAch,
    tMinC: season.tMin, tMaxC: season.tMax, solarKwhDay: season.solarKwhDay,
    daylightHours: season.sunset - season.sunrise, windMs: season.windMs,
    latitude: season.latitude, avgTempCAnnual: season.avgTempCAnnual
  };
}

async function main() {
  console.log("Fetching real NASA POWER climatology for the 10 reference locations...");
  const REAL_LOCS = [
    { id: "leh", latitude: 34.15, longitude: 77.58 }, { id: "kargil", latitude: 34.55, longitude: 76.13 },
    { id: "keylong", latitude: 32.57, longitude: 77.03 }, { id: "munsiyari", latitude: 30.07, longitude: 80.24 },
    { id: "dras", latitude: 34.43, longitude: 75.75 }, { id: "srinagar", latitude: 34.08, longitude: 74.80 },
    { id: "pune", latitude: 18.52, longitude: 73.88 }, { id: "bareilly", latitude: 28.37, longitude: 79.43 },
    { id: "nagpur", latitude: 21.15, longitude: 79.09 }, { id: "shimla", latitude: 31.10, longitude: 77.17 }
  ];

  let realContexts = [];
  for (const loc of REAL_LOCS) {
    try {
      const monthly = await fetchNasaMonthly(loc.latitude, loc.longitude);
      realContexts.push(...buildContextsForLocation(loc, monthly));
      console.log(`  ${loc.id}: OK (4 seasonal contexts)`);
    } catch (e) {
      console.log(`  ${loc.id}: FAILED (${e.message}) -- skipping, fewer real contexts than planned`);
    }
  }
  console.log(`Real contexts: ${realContexts.length}`);

  const interpolated = [];
  for (let i = 0; i < 20; i++) {
    const a = pick(realContexts), b = pick(realContexts);
    interpolated.push(interpolateContext(a, b, Math.random(), `interp_${i}`));
  }
  const allContexts = [...realContexts, ...interpolated];
  console.log(`Total contexts (real + interpolated): ${allContexts.length}`);

  const simConfig = { timeStepMinutes: 60, periodType: "24H", days: 1 };
  const rows = [];
  const t0 = Date.now();
  for (const ctx of allContexts) {
    for (let i = 0; i < 400; i++) {
      const design = finalizeDesign(randomDesign());
      let result;
      try {
        result = ENGINE.runSimulation(design, ctx, simConfig);
      } catch (e) {
        continue; // skip invalid random combos (e.g. degenerate geometry)
      }
      const features = extractFeatures(design, ctx);
      rows.push({
        context: ctx.label,
        features,
        targets: {
          comfortScore: result.scores.comfortScore,
          heatRetentionPct: result.scores.heatRetentionPct,
          solarUtilizationPct: result.scores.solarUtilizationPct,
          energyDemandKwhPerDay: result.daily.heatingReqKwh + result.daily.coolingReqKwh
        }
      });
    }
  }
  console.log(`Generated ${rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const outPath = path.join(__dirname, "training-data.json");
  fs.writeFileSync(outPath, JSON.stringify({ contexts: allContexts.map(c => c.label), rows }), "utf8");
  console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
