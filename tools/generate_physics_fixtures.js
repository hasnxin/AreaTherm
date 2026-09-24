/* AreaTherm — regenerates backend/src/test/resources/physics/physics_fixtures.json
   from the real, current app/js/engine.js (the JS engine is the source of
   truth; ThermalEngine.java is verified against ITS output, never the other
   way around). Run from the repo root: `node tools/generate_physics_fixtures.js`.

   Mirrors ThermalEngineGoldenFileTest.toComparableJson() exactly -- the two
   must stay in lockstep, or the Java test's diff becomes meaningless. Loads
   engine.js/data.js/config.js exactly as the browser does (they're plain
   `window.X = ...` scripts, no build step, no npm dependency needed here),
   by stubbing the one global (`window`) they reference.

   Self-check: with no arguments, regenerates all 6 named fixtures and
   diffs them against the currently-committed physics_fixtures.json,
   printing PASS/FAIL per fixture rather than overwriting anything -- run
   this after any engine.js change to see exactly what moved. Pass
   --write to overwrite physics_fixtures.json with the freshly computed
   values instead (only do this once you've reviewed the diff and the
   change is intentional). */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES_PATH = path.join(REPO_ROOT, "backend/src/test/resources/physics/physics_fixtures.json");

function loadBrowserGlobalScript(sandbox, relPath) {
  const code = fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
  vm.runInContext(code, sandbox, { filename: relPath });
}

function loadEngine() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  loadBrowserGlobalScript(sandbox, "app/js/config.js");
  loadBrowserGlobalScript(sandbox, "app/js/data.js");
  loadBrowserGlobalScript(sandbox, "app/js/engine.js");
  return sandbox.window.APP_ENGINE;
}

// ---- Fixed reference inputs -- MUST match ThermalEngineGoldenFileTest.java's
// baselineDesign()/winterSeason()/summerSeason() field-for-field (that file
// documents which Java constructor args map to which of these). -----------

function baselineDesign() {
  return {
    name: "Baseline Shelter",
    shape: "RECTANGULAR",
    length: 6, width: 4, height: 3,
    orientation: "SOUTH", azimuthDeg: 0,
    wall: { materialId: "wall_insulated_panel", thicknessMm: 186, insulationMaterialId: "ins_puf", insulationThicknessMm: 35 },
    roof: { materialId: "roof_insulated_metal", thicknessMm: 101, insulationMaterialId: "ins_puf", insulationThicknessMm: 69 },
    floor: { materialId: "wall_concrete", thicknessMm: 100 },
    windows: [{ areaEach: 2.91, count: 1, orientation: "FRONT", glazingMaterialId: "glaze_single" }],
    doors: [{ areaEach: 1.8, count: 1, orientation: "FRONT" }],
    airLeakageAch: 0.8,
    thermalMass: { materialId: "mass_concrete", massKg: 1622, surfaceAreaM2: 5.406666666666666, exposure: "FLOOR" },
    occupancy: 2,
    occupancyActivity: "SEATED",
    internalHeatGainW: 150,
    groundTempC: null,
    comfort: { min: 15, max: 27 }
  };
}

const winterSeason = { tMin: 4.4, tMax: 16.1, solarKwhDay: 5.4, sunrise: 5.9, sunset: 18.9, windMs: 2.3, rhPct: 33, cloudPct: 20, latitude: 34.15, avgTempCAnnual: -2.75, monthlyTemp: null, hourly: null };
const summerSeason = { tMin: 12.0, tMax: 28.5, solarKwhDay: 7.2, sunrise: 5.2, sunset: 19.6, windMs: 1.8, rhPct: 28, cloudPct: 15, latitude: 34.15, avgTempCAnnual: -2.75, monthlyTemp: null, hourly: null };

function simConfig(timeStepMinutes) {
  return { timeStepMinutes, periodType: "24H", days: 1 };
}

// A 24-hour occupancy schedule for fixture5 -- an observation-post pattern:
// 2 people on duty round the clock, dropping to 1 overnight, activity
// shifting from SEATED (day watch) to SLEEPING (the off-duty person resting
// nearby) -- deliberately NOT identical to the flat baseline (occupancy=2,
// SEATED always), so this fixture actually exercises the schedule path.
function observationPostSchedule() {
  const day = { persons: 2, activityId: "SEATED" };
  const night = { persons: 1, activityId: "SLEEPING" };
  const sched = [];
  for (let h = 0; h < 24; h++) sched.push((h >= 6 && h < 22) ? day : night);
  return sched;
}

// ---- summarize(): mirrors ThermalEngineGoldenFileTest.toComparableJson() exactly ----
function summarize(result) {
  const node = JSON.parse(JSON.stringify(result)); // deep clone, same effect as Jackson's valueToTree
  delete node.series;
  node.seriesLength = result.series.length;
  const idx = [0, Math.floor(result.series.length / 4), Math.floor(result.series.length / 2), result.series.length - 1];
  node.seriesSample = idx.map(i => result.series[i]);
  delete node.name;
  return node;
}

function buildFixtures(ENGINE) {
  const base = baselineDesign();
  const fixtures = {};

  fixtures.fixture0_60min_winter_baseline = summarize(ENGINE.runSimulation(base, winterSeason, simConfig(60)));
  fixtures.fixture1_15min_winter_rectangular = summarize(ENGINE.runSimulation(base, winterSeason, simConfig(15)));

  const pcmDesign = { ...base, thermalMass: { materialId: "mass_pcm", massKg: 400, surfaceAreaM2: 5, exposure: "WALL" } };
  fixtures.fixture2_60min_winter_pcm = summarize(ENGINE.runSimulation(pcmDesign, winterSeason, simConfig(60)));

  const roundDesign = { ...base, shape: "CIRCULAR", length: null, width: null, diameter: 6.0 };
  fixtures.fixture3_60min_winter_round = summarize(ENGINE.runSimulation(roundDesign, winterSeason, simConfig(60)));

  fixtures.fixture4_60min_summer_rectangular = summarize(ENGINE.runSimulation(base, summerSeason, simConfig(60)));

  const scheduleDesign = { ...base, occupancySchedule: observationPostSchedule() };
  fixtures.fixture5_60min_winter_occupancySchedule = summarize(ENGINE.runSimulation(scheduleDesign, winterSeason, simConfig(60)));

  return fixtures;
}

function diffNumeric(pathStr, expected, actual, diffs, tol) {
  if (expected === null || expected === undefined) {
    if (actual !== null && actual !== undefined) diffs.push(`${pathStr}: expected null, got ${JSON.stringify(actual)}`);
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) {
      diffs.push(`${pathStr}: array size expected ${expected.length} got ${Array.isArray(actual) ? actual.length : actual}`);
      return;
    }
    expected.forEach((v, i) => diffNumeric(`${pathStr}[${i}]`, v, actual[i], diffs, tol));
  } else if (typeof expected === "object") {
    if (typeof actual !== "object" || actual === null) { diffs.push(`${pathStr}: expected object, got ${JSON.stringify(actual)}`); return; }
    Object.keys(expected).forEach(k => { if (k !== "name") diffNumeric(`${pathStr}.${k}`, expected[k], actual[k], diffs, tol); });
  } else if (typeof expected === "number") {
    if (typeof actual !== "number" || Math.abs(expected - actual) > tol) diffs.push(`${pathStr}: expected ${expected} got ${actual}`);
  } else if (expected !== actual) {
    diffs.push(`${pathStr}: expected ${expected} got ${actual}`);
  }
}

function main() {
  const write = process.argv.includes("--write");
  const ENGINE = loadEngine();
  const fresh = buildFixtures(ENGINE);

  if (write) {
    fs.writeFileSync(FIXTURES_PATH, JSON.stringify(fresh, null, 2) + "\n");
    console.log("Wrote " + FIXTURES_PATH + " (" + Object.keys(fresh).length + " fixtures).");
    return;
  }

  const existing = fs.existsSync(FIXTURES_PATH) ? JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf8")) : {};
  let anyFail = false;
  for (const key of Object.keys(fresh)) {
    if (!(key in existing)) { console.log(`NEW    ${key} (not in committed fixtures yet)`); continue; }
    const diffs = [];
    diffNumeric(key, existing[key], fresh[key], diffs, 0.05);
    if (diffs.length === 0) { console.log(`PASS   ${key}`); }
    else { anyFail = true; console.log(`FAIL   ${key} (${diffs.length} mismatch(es))`); diffs.slice(0, 10).forEach(d => console.log("         " + d)); }
  }
  if (anyFail) { console.log("\nSome fixtures differ from the committed file -- re-run with --write once you've reviewed why."); process.exitCode = 1; }
  else { console.log("\nAll existing fixtures reproduced within tolerance."); }
}

main();
