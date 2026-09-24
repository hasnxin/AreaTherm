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
      orientation: "SOUTH", azimuthDeg: 0,
      // Re-optimized against live Leh, Ladakh weather after fixing the
      // optimizer's search (it previously couldn't cross-vary orientation
      // against envelope choice) and comfort scoring (previously blind to
      // how badly a design missed the comfort band, not just how often).
      // This is the ML-broadened search's top physics-verified pick:
      // thermalComfortScore 69 vs the old baseline's 57, comfortScore 41.27
      // vs 39.51, tighter indoor range (5.97-23.79°C vs 5.92-22.08°C).
      wall: { materialId: "wall_insulated_panel", thicknessMm: 186, insulationMaterialId: "ins_puf", insulationThicknessMm: 35 },
      roof: { materialId: "roof_insulated_metal", thicknessMm: 101, insulationMaterialId: "ins_puf", insulationThicknessMm: 69 },
      floor: { materialId: "wall_concrete", thicknessMm: 100 },
      windows: [{ areaEach: 2.91, count: 1, orientation: "FRONT", glazingMaterialId: "glaze_single" }],
      doors: [{ areaEach: 1.8, count: 1, orientation: "FRONT" }],
      airLeakageAch: 0.8,
      // exposure: how much room-air movement reaches the mass surface —
      // see config.js THERMAL_MASS_EXPOSURE_H_VALUES. FLOOR is the default
      // so any design saved before this field existed keeps its old h_mass.
      thermalMass: { materialId: "mass_concrete", massKg: 1622, surfaceAreaM2: 5.406666666666666, exposure: "FLOOR" },
      occupancy: 2,
      occupancyActivity: "SEATED",
      internalHeatGainW: 150, // equipment/other gain, separate from occupant heat (see engine.js computeOccupancyHeat)
      groundTempC: null,
      comfort: {
        profileId: "human",
        baseMin: 18, max: 27,
        clothingLevel: "WINTER", activityLevel: "SEATED",
        min: DATA.effectiveComfortMin(18, "WINTER", "SEATED", 27)
      }
    };
  }

  function genId(prefix) { return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7); }

  function freshState() {
    return {
      project: { id: genId("proj"), name: "Untitled Project", createdAt: new Date().toISOString() },
      locationKey: null,
      location: null,
      seasonKey: "Winter",
      climateSource: null, // { type, tier: 'LIVE'|'FRESH_CACHE'|'STALE_CACHE', apiSource, label, period, fetchedAt }
      design: defaultDesign(),
      simConfig: { timeStepMinutes: 60, periodType: "24H", days: 1 },
      weights: { ...window.APP_CONFIG.DEFAULT_WEIGHTS },
      mode: "SIMPLE",
      theme: "LIGHT", // 'LIGHT' | 'DARK' — see Settings
      units: "METRIC", // 'METRIC' | 'IMPERIAL' — see Settings
      simulationHistory: [], // [{id, ts, locationLabel, designName, thermalComfortScore}]
      lastSimulationResult: null,
      lastOptimizationResult: null,
      validationDatasets: [], // [{id, name, points:[{ts,ambient,measured,predicted,...}], stats}] — local-only, no backend equivalent
      // Backend-persisted ids for the current working state (see
      // backend-api.js/adapter.js) — null until the first backend save of
      // each resource. A login session's own token lives separately (see
      // backend-api.js's own AUTH_KEY), not here, since it must survive
      // "Reset project" and isn't part of the DATABASE_SCHEMA-mirrored shape
      // the rest of this object follows.
      backend: {
        projectId: null, locationId: null, climateProfileId: null,
        comfortProfileId: null, shelterDesignId: null,
        lastSimulationId: null, lastOptimizationRunId: null
      }
    };
  }

  // Merge onto freshState() defaults so a state saved before a new top-level
  // field existed (e.g. theme/units) still gets a sane default instead of
  // undefined, without touching any of that saved session's actual data.
  let state = Object.assign(freshState(), load() || {});

  function load() {
    try {
      let raw = localStorage.getItem(KEY);
      if (!raw) raw = localStorage.getItem(OLD_KEY); // one-time migration from v1 state shape
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Backfill fields added after a save may have happened under an older shape.
      if (parsed.design && parsed.design.occupancyActivity == null) parsed.design.occupancyActivity = "SEATED";
      if (parsed.design && parsed.design.thermalMass && parsed.design.thermalMass.exposure == null) parsed.design.thermalMass.exposure = "FLOOR";
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
  let storageWarned = false;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // The live design state is small on its own now that the big
      // consumers (API cache, saved-project snapshots) live in IndexedDB —
      // this should be rare. Best-effort async recovery: clear the
      // disposable cache and retry once, without making save() itself
      // async (it has many synchronous callers across the app).
      if (window.APP_RELIABLE) {
        window.APP_RELIABLE.clearAllCache().then(() => {
          try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) { /* still full */ }
        }).catch(() => {});
      }
      if (!storageWarned && window.APP && window.APP.toast) {
        storageWarned = true;
        window.APP.toast("Could not save project — browser storage is full or unavailable. Retrying after freeing cached data...");
      }
    }
  }

  // Frees the disposable reliability-layer cache (weather/NASA POWER/
  // elevation lookups, never auto-evicted — see reliability.js). Exposed so
  // Settings can offer it as a manual "storage full" recovery action; save()
  // above already does this automatically the moment a write actually fails.
  async function clearCache() {
    return window.APP_RELIABLE ? window.APP_RELIABLE.clearAllCache() : 0;
  }

  function get() { return state; }
  function reset() { state = freshState(); save(); return state; }

  // ---- Multiple named projects (backend-persisted — see backend-api.js/
  // adapter.js) ---------------------------------------------------------
  // The backend Project table is the source of truth for the saved-projects
  // list; there is no local snapshot anymore (superseded — this used to be
  // an IndexedDB mirror of full state objects before the backend existed).
  // listProjects() therefore makes a real network call now — callers must
  // await it (Settings renders a placeholder, then patches in the real
  // table once this resolves; see ui-3.js).
  async function listProjects() {
    const projects = await window.APP_BACKEND.listProjects();
    return projects
      .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, isCurrent: state.backend.projectId === p.id }))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }
  // Persists the current working design as a named backend project — reuses
  // the already-linked backend project if this state has one, else creates
  // a new one, then saves location/climate/comfort/design onto it (see
  // adapter.ensureAllPersisted).
  async function saveAsProject(name) {
    if (name) state.project.name = name;
    save();
    await window.APP_ADAPTER.ensureAllPersisted(state, () => {});
    return true;
  }
  async function loadProject(id) {
    const loaded = await window.APP_ADAPTER.loadProjectFromBackend(id);
    if (!loaded) return false;
    state = loaded;
    save();
    return true;
  }
  async function deleteProject(id) {
    await window.APP_BACKEND.deleteProject(id);
    if (state.backend.projectId === id) { state = freshState(); save(); }
  }
  async function newProject(name) {
    state = freshState();
    state.project.name = name || "Untitled Project";
    await window.APP_ADAPTER.ensureProject(state);
    save();
    return state;
  }

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
      // Also merge onto the live season object (STORE.currentSeason()) so
      // ENGINE.runSimulation's ground-temperature estimate (see
      // estimateGroundTempC in engine.js) can use real per-location 20-yr
      // monthly/annual normals instead of the current forecast week's mean
      // — every simulation call already reads its `season` from here.
      const season = state.location.seasons && state.location.seasons[state.seasonKey];
      if (season) {
        season.avgTempCAnnual = nasa.tempCAnnual;
        season.monthlyTemp = nasa.monthlyTemp;
      }
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
    // Known immediately (no need to wait on the NASA fetch below) — read
    // by ENGINE.runSimulation for latitude-aware orientation factors (see
    // orientationFactorTableForLatitude in engine.js).
    climate.latitude = loc.latitude;
    state.locationKey = loc.id;
    state.location = {
      key: loc.id || null, label: loc.name,
      country: "India", state: loc.region || "Custom coordinates", district: "",
      latitude: loc.latitude, longitude: loc.longitude,
      elevationM: climate.elevationM != null ? climate.elevationM : loc.elevationM, // != null, not ||: a real 0m (sea level) is a valid elevation
      elevationSource: null, // refined below by enrichLocation with a dedicated elevation API
      soilSurface: loc.soilSurface || null, // static catalog data — see data.js's PREDEFINED_LOCATIONS comment; null for custom coordinates (no catalog entry) and for the 5 reference locations SoilGrids returned no data for
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
    climate.latitude = lat; // see loadRealClimate — read by ENGINE.runSimulation
    const trimmedLabel = label && label.trim() ? label.trim() : null;
    // Best-effort reverse geocode (OpenStreetMap Nominatim, via util.js) so a
    // custom point gets a real place name + region instead of a bare
    // "Custom location (lat, lon)" placeholder. Always attempted (even with
    // a user-typed label) so the region still gets filled in; never blocks
    // on failure — reverseGeocode already catches its own errors and
    // resolves to null.
    const resolved = await window.U.reverseGeocode(lat, lon);
    const customLabel = trimmedLabel || (resolved ? resolved.name : `Custom location (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
    state.locationKey = "custom";
    state.location = {
      key: "custom", label: customLabel,
      country: "", state: (resolved && resolved.region) || "", district: "",
      latitude: lat, longitude: lon,
      elevationM: climate.elevationM != null ? climate.elevationM : null, // != null, not ||: a real 0m (sea level) is a valid elevation
      elevationSource: null,
      soilSurface: null, // only the 10 catalog locations have offline-fetched soil data — see data.js
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
    state.validationDatasets = state.validationDatasets.slice(0, 10); // each carries a full points[] series — unbounded growth here fills storage just as surely as the reliability cache
    save();
  }

  function setTheme(theme) {
    state.theme = theme === "DARK" ? "DARK" : "LIGHT";
    save();
  }

  return {
    get, save, reset, freshState, loadRealClimate, loadCustomLocation,
    currentSeason, updateDesign, setTheme,
    recordSimulation, recordOptimization, addValidationDataset, defaultDesign,
    listProjects, saveAsProject, loadProject, deleteProject, newProject, clearCache
  };
})();
