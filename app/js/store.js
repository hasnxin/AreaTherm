/* AreaTherm — app state ("database") + localStorage persistence.
   Field names mirror DATABASE_SCHEMA.sql so a real API client is a
   drop-in replacement for this module (see ARCHITECTURE.md SS2, SS6). */

window.APP_STORE = (function () {
  const DATA = window.APP_DATA;
  const KEY = "areatherm_state_v2";
  const OLD_KEY = "areatherm_state_v1";

  function defaultDesign() {
    return {
      name: "Baseline Shelter",
      shape: "RECTANGULAR",
      length: 6, width: 4, height: 3,
      orientation: "EAST", azimuthDeg: 90,
      wall: { materialId: "wall_stone", thicknessMm: 400, insulationMaterialId: "ins_puf", insulationThicknessMm: 50 },
      roof: { materialId: "roof_rcc", thicknessMm: 150, insulationMaterialId: "ins_puf", insulationThicknessMm: 50 },
      floor: { materialId: "wall_concrete", thicknessMm: 100 },
      windows: [{ areaEach: 2.4, count: 1, orientation: "FRONT", glazingMaterialId: "glaze_double" }],
      doors: [{ areaEach: 1.8, count: 1 }],
      airLeakageAch: 0.8,
      thermalMass: { materialId: "mass_stone", massKg: 800, surfaceAreaM2: 6 },
      occupancy: 2,
      occupancyActivity: "SEATED",
      internalHeatGainW: 150, // equipment/other gain, separate from occupant heat (see engine.js computeOccupancyHeat)
      groundTempC: null,
      comfort: { profileId: "human", min: 18, max: 27 }
    };
  }

  function freshState() {
    return {
      project: { name: "Untitled Project", createdAt: new Date().toISOString() },
      locationKey: null,
      location: null,
      seasonKey: "Winter",
      climateSource: null, // { type, tier: 'LIVE'|'FRESH_CACHE'|'STALE_CACHE', apiSource, label, period, fetchedAt }
      design: defaultDesign(),
      simConfig: { timeStepMinutes: 60, periodType: "24H", days: 1 },
      weights: { ...window.APP_CONFIG.DEFAULT_WEIGHTS },
      mode: "SIMPLE",
      theme: "LIGHT",
      simulationHistory: [], // [{id, ts, locationLabel, designName, thermalComfortScore}]
      lastSimulationResult: null,
      lastOptimizationResult: null,
      validationDatasets: [] // [{id, name, points:[{ts,ambient,measured,predicted,...}], stats}]
    };
  }

  let state = load() || freshState();

  function load() {
    try {
      let raw = localStorage.getItem(KEY);
      if (!raw) raw = localStorage.getItem(OLD_KEY); // one-time migration from v1 state shape
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Backfill fields added after a save may have happened under an older shape.
      if (parsed.design && parsed.design.occupancyActivity == null) parsed.design.occupancyActivity = "SEATED";
      if (parsed.theme == null) parsed.theme = "LIGHT";
      // A cached RESULT computed by an older engine/API version isn't
      // salvageable by patching a field or two — it's missing whole nested
      // shapes the current UI reads unconditionally (occupancy diagnostics,
      // the full candidate list, monthly climate series). Rather than let a
      // screen throw on first render, discard just that derived/fetched
      // cache and let the user re-run that one step; design/project/comfort
      // inputs are untouched.
      if (parsed.lastSimulationResult && parsed.lastSimulationResult.occupancy == null) {
        parsed.lastSimulationResult = null;
      }
      if (parsed.lastOptimizationResult && !Array.isArray(parsed.lastOptimizationResult.all)) {
        parsed.lastOptimizationResult = null;
      }
      if (parsed.location && parsed.location.solarDataSource && !parsed.location.solarDataSource.monthlyGhi) {
        parsed.location.solarDataSource = null; // falls back to the already-handled "extrapolated" labelling
      }
      return parsed;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function get() { return state; }
  function reset() { state = freshState(); save(); return state; }

  function tierLabel(tier, ageMs) {
    if (tier === "LIVE") return "live";
    const ageMin = ageMs != null ? Math.round(ageMs / 60000) : null;
    const ageStr = ageMin == null ? "" : ageMin < 60 ? `${ageMin} min ago` : `${Math.round(ageMin / 60)} h ago`;
    return tier === "FRESH_CACHE" ? `cached${ageStr ? ", " + ageStr : ""}` : `STALE cache${ageStr ? ", " + ageStr : ""} — network unavailable`;
  }

  function buildClimateSource(apiSource, apiLabel, period, tier, ageMs, fetchedAt, tierError) {
    return {
      type: tier === "LIVE" ? "REAL" : (tier === "FRESH_CACHE" ? "REAL_CACHED" : "STALE_CACHED"),
      tier, apiSource,
      label: `${apiLabel} (${tierLabel(tier, ageMs)})`,
      period, fetchedAt: fetchedAt || Date.now(),
      tierError: tierError || null // the specific reason a cache fallback happened, if any — shown as a tooltip (see util.js badge())
    };
  }

  // Shared tail end of both loadRealClimate (catalog location) and
  // loadCustomLocation (manual lat/lon): resolves elevation via the real
  // Elevation API, then NASA POWER climatology — both independently, so a
  // failure in either never blocks the other or the weather that already
  // drove the simulation. Mutates + saves `state.location`.
  async function enrichLocation(lat, lon) {
    const elevP = window.APP_ELEVATION.fetchElevation(lat, lon).then(elev => {
      state.location.elevationM = elev.data.elevationM;
      state.location.elevationSource = { label: elev.data.source, tier: elev.tier };
      save();
    }).catch(() => { /* keep the catalog/forecast-derived elevation figure */ });

    const nasaP = window.APP_NASA.fetchClimatology(lat, lon).then(nasa => {
      state.location.annualSolarKwhM2Yr = nasa.annualSolarKwhM2Yr;
      state.location.avgTempCAnnual = nasa.tempCAnnual;
      state.location.solarDataSource = {
        label: nasa.label, period: nasa.period, fetchedAt: nasa.fetchedAt, tier: nasa.tier,
        ghiKwhM2DayAnnual: nasa.ghiKwhM2DayAnnual, dniKwhM2DayAnnual: nasa.dniKwhM2DayAnnual, difKwhM2DayAnnual: nasa.difKwhM2DayAnnual,
        monthlyGhi: nasa.monthlyGhi, monthlyTemp: nasa.monthlyTemp
      };
      save();
    }).catch(() => {
      // Leave the Open-Meteo-derived extrapolation in place; UI labels it
      // as such whenever solarDataSource is null.
    });

    // Independent fetches (neither result feeds the other, each has its own
    // catch above) — run concurrently rather than summing their latencies.
    await Promise.all([elevP, nasaP]);
  }

  // Fetches live weather (Open-Meteo) + real annual solar climatology
  // (NASA POWER) + real elevation for a predefined location and stores it
  // as a single pseudo-season "Live" inside a {seasons:{...}} map, so every
  // screen that reads STORE.currentSeason() works unchanged.
  async function loadRealClimate(locationId, opts) {
    const loc = DATA.predefinedLocationById(locationId);
    if (!loc) throw new Error("Unknown location: " + locationId);
    const climate = await window.APP_WEATHER.fetchOpenMeteo(loc.latitude, loc.longitude, opts);
    state.locationKey = loc.id;
    state.location = {
      key: loc.id, label: loc.name,
      country: "India", state: loc.region, district: "",
      latitude: loc.latitude, longitude: loc.longitude,
      elevationM: climate.elevationM != null ? climate.elevationM : loc.elevationM, // != null, not ||: a real 0m (sea level) is a valid elevation
      elevationSource: null, // refined below by enrichLocation with a dedicated elevation API
      annualSolarKwhM2Yr: Math.round(climate.solarKwhDay * 365),
      avgSunshineHoursDay: Math.max(0, Math.round((climate.sunset - climate.sunrise) * 10) / 10),
      avgCloudFreeDays: Math.round(((100 - climate.cloudPct) / 100) * 365),
      solarDataSource: null, // set below if the NASA fetch succeeds
      seasons: { Live: climate }
    };
    state.seasonKey = "Live";
    state.climateSource = buildClimateSource("OPEN_METEO", "Open-Meteo", climate.period, climate.tier, climate.ageMs, climate.fetchedAt, climate.tierError);
    state.project.name = `${loc.name} — Passive Shelter`;
    save();
    await enrichLocation(loc.latitude, loc.longitude);
    return state.location;
  }

  // Manual coordinate entry: same pipeline as loadRealClimate but for an
  // arbitrary lat/lon the user typed in, not one of the 10 catalog
  // locations. Caller (UI) is expected to validate the coordinates first
  // (ENGINE.validateCoordinates) — this mirrors how loadRealClimate trusts
  // its locationId argument.
  async function loadCustomLocation(lat, lon, label, opts) {
    const climate = await window.APP_WEATHER.fetchOpenMeteo(lat, lon, opts);
    const customLabel = label && label.trim() ? label.trim() : `Custom location (${lat.toFixed(3)}, ${lon.toFixed(3)})`;
    state.locationKey = "custom";
    state.location = {
      key: "custom", label: customLabel,
      country: "", state: "", district: "",
      latitude: lat, longitude: lon,
      elevationM: climate.elevationM != null ? climate.elevationM : null, // != null, not ||: a real 0m (sea level) is a valid elevation
      elevationSource: null,
      annualSolarKwhM2Yr: Math.round(climate.solarKwhDay * 365),
      avgSunshineHoursDay: Math.max(0, Math.round((climate.sunset - climate.sunrise) * 10) / 10),
      avgCloudFreeDays: Math.round(((100 - climate.cloudPct) / 100) * 365),
      solarDataSource: null,
      seasons: { Live: climate }
    };
    state.seasonKey = "Live";
    state.climateSource = buildClimateSource("OPEN_METEO", "Open-Meteo", climate.period, climate.tier, climate.ageMs, climate.fetchedAt, climate.tierError);
    state.project.name = `${customLabel} — Passive Shelter`;
    save();
    await enrichLocation(lat, lon);
    return state.location;
  }

  function currentSeason() {
    if (!state.location) return null;
    return state.location.seasons[state.seasonKey];
  }

  function updateDesign(patch) {
    state.design = { ...state.design, ...patch };
    save();
  }

  function recordSimulation(result) {
    state.lastSimulationResult = result;
    state.simulationHistory.unshift({
      id: "SIM-" + Date.now(),
      ts: new Date().toISOString(),
      locationLabel: state.location ? state.location.label : "Custom location",
      designName: state.design.name,
      thermalComfortScore: result.scores.thermalComfortScore
    });
    state.simulationHistory = state.simulationHistory.slice(0, 20);
    save();
  }

  function recordOptimization(result) {
    state.lastOptimizationResult = result;
    save();
  }

  function addValidationDataset(ds) {
    state.validationDatasets.unshift(ds);
    save();
  }

  function setTheme(theme) {
    state.theme = theme === "DARK" ? "DARK" : "LIGHT";
    save();
  }

  return {
    get, save, reset, loadRealClimate, loadCustomLocation,
    currentSeason, updateDesign, setTheme,
    recordSimulation, recordOptimization, addValidationDataset, defaultDesign
  };
})();
