/* AreaTherm — app state ("database") + localStorage persistence.
   Field names mirror DATABASE_SCHEMA.sql so a real API client is a
   drop-in replacement for this module (see ARCHITECTURE.md §2, §6). */

window.APP_STORE = (function () {
  const DATA = window.APP_DATA;
  const KEY = "areatherm_state_v1";

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
      occupancyActivity: "RESTING",
      internalHeatGainW: DATA.occupancyHeatWatts(2, "RESTING"),
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
      climateSource: null, // { type: 'REAL', apiSource, label, period, fetchedAt }
      design: defaultDesign(),
      simConfig: { timeStepMinutes: 60, periodType: "24H", days: 1 },
      weights: { ...window.APP_CONFIG.DEFAULT_WEIGHTS },
      mode: "SIMPLE",
      theme: "light", // 'light' | 'dark' — see Settings
      units: "METRIC", // 'METRIC' | 'IMPERIAL' — see Settings
      simulationHistory: [], // [{id, ts, locationLabel, designName, thermalComfortScore}]
      lastSimulationResult: null,
      lastOptimizationResult: null,
      validationDatasets: [] // [{id, name, points:[{ts,ambient,measured,predicted,...}], stats}]
    };
  }

  // Merge onto freshState() defaults so a state saved before a new top-level
  // field existed (e.g. theme/units) still gets a sane default instead of
  // undefined, without touching any of that saved session's actual data.
  let state = Object.assign(freshState(), load() || {});

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  let storageWarned = false;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      if (!storageWarned && window.APP && window.APP.toast) {
        storageWarned = true;
        window.APP.toast("Could not save project — browser storage is full or unavailable. Your changes may not persist.");
      }
    }
    mirrorIntoProjectsList();
  }

  function get() { return state; }
  function reset() { state = freshState(); save(); return state; }

  // ---- Multiple named projects ------------------------------------------
  // A separate list of full-state snapshots, keyed by state.project.id.
  // The "live" state above (areatherm_state_v1) is always whatever you're
  // currently working on — this list is what lets you keep more than one
  // named design and switch between them. Every save() call mirrors the
  // live state into its matching list entry IF that project has already
  // been explicitly saved to the list at least once (via saveAsProject) —
  // a brand-new project doesn't appear in the list until you name it.
  const PROJECTS_KEY = "areatherm_projects_v1";
  function loadProjectsList() {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function writeProjectsList(list) {
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  function mirrorIntoProjectsList() {
    if (!state.project || !state.project.id) return;
    const list = loadProjectsList();
    const idx = list.findIndex(p => p.id === state.project.id);
    if (idx === -1) return; // not saved as a named project yet — nothing to mirror into
    list[idx] = { id: state.project.id, name: state.project.name, updatedAt: new Date().toISOString(), snapshot: state };
    writeProjectsList(list);
  }
  function listProjects() {
    return loadProjectsList()
      .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, isCurrent: state.project && state.project.id === p.id }))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }
  function saveAsProject(name) {
    if (!state.project.id) state.project.id = genId("proj");
    if (name) state.project.name = name;
    const list = loadProjectsList();
    const idx = list.findIndex(p => p.id === state.project.id);
    const entry = { id: state.project.id, name: state.project.name, updatedAt: new Date().toISOString(), snapshot: state };
    if (idx === -1) list.push(entry); else list[idx] = entry;
    writeProjectsList(list);
    save();
  }
  function loadProject(id) {
    const list = loadProjectsList();
    const entry = list.find(p => p.id === id);
    if (!entry) return false;
    state = Object.assign(freshState(), JSON.parse(JSON.stringify(entry.snapshot)));
    save();
    return true;
  }
  function deleteProject(id) {
    writeProjectsList(loadProjectsList().filter(p => p.id !== id));
  }
  function newProject(name) {
    state = freshState();
    state.project.name = name || "Untitled Project";
    saveAsProject(state.project.name);
    return state;
  }

  // Fetches live weather (Open-Meteo) + real annual solar climatology
  // (NASA POWER, below) for a predefined location and stores it as a
  // single pseudo-season "Live" inside a {seasons:{...}} map, so every
  // screen that reads STORE.currentSeason() works unchanged.
  // Accepts either a predefined location id (string) or a custom location
  // object { name, latitude, longitude, region?, elevationM? } — e.g. from
  // manual coordinate entry / reverse geocoding.
  async function loadRealClimate(locationIdOrCustom) {
    let loc;
    if (typeof locationIdOrCustom === "string") {
      loc = DATA.predefinedLocationById(locationIdOrCustom);
      if (!loc) throw new Error("Unknown location: " + locationIdOrCustom);
    } else {
      loc = locationIdOrCustom;
    }
    const climate = await window.APP_WEATHER.fetchOpenMeteo(loc.latitude, loc.longitude);
    state.locationKey = loc.id || null;
    state.location = {
      key: loc.id || null, label: loc.name,
      country: "India", state: loc.region || "Custom coordinates", district: "",
      latitude: loc.latitude, longitude: loc.longitude,
      elevationM: climate.elevationM || loc.elevationM || null,
      // Extrapolated placeholder until/unless NASA POWER climatology (below)
      // supplies a real 20-year annual figure — kept only as a fallback.
      annualSolarKwhM2Yr: Math.round(climate.solarKwhDay * 365),
      avgSunshineHoursDay: Math.max(0, Math.round((climate.sunset - climate.sunrise) * 10) / 10),
      avgCloudFreeDays: Math.round(((100 - climate.cloudPct) / 100) * 365),
      solarDataSource: null, // set below if the NASA fetch succeeds
      seasons: { Live: climate }
    };
    state.seasonKey = "Live";
    state.climateSource = {
      type: "REAL", apiSource: "OPEN_METEO",
      label: "Open-Meteo (live)", period: climate.period, fetchedAt: climate.fetchedAt
    };
    state.project.name = `${loc.name} — Passive Shelter`;
    save();

    // NASA POWER gives real long-term climatology, not a forecast
    // extrapolation — a strictly better "annual solar potential" figure.
    // Fetched separately so a NASA outage never blocks the (higher
    // priority) Open-Meteo weather that actually drives the simulation.
    try {
      const nasa = await window.APP_NASA.fetchClimatology(loc.latitude, loc.longitude);
      state.location.annualSolarKwhM2Yr = nasa.annualSolarKwhM2Yr;
      state.location.avgTempCAnnual = nasa.tempCAnnual;
      state.location.solarDataSource = {
        label: nasa.label, period: nasa.period, fetchedAt: nasa.fetchedAt,
        ghiKwhM2DayAnnual: nasa.ghiKwhM2DayAnnual, dniKwhM2DayAnnual: nasa.dniKwhM2DayAnnual,
        monthlyGhi: nasa.monthlyGhi, monthlyTemp: nasa.monthlyTemp
      };
      save();
    } catch (e) {
      // Leave the Open-Meteo-derived extrapolation in place; UI labels it
      // as such whenever solarDataSource is null.
    }
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

  return {
    get, save, reset, loadRealClimate,
    currentSeason, updateDesign,
    recordSimulation, recordOptimization, addValidationDataset, defaultDesign,
    listProjects, saveAsProject, loadProject, deleteProject, newProject
  };
})();
