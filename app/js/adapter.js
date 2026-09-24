/* AreaTherm — bridges STORE's local design/state shape and the backend's
   REST DTOs, in both directions, plus the "official run" orchestration
   (project/location/climate/comfort/shelter-design persistence, then
   simulation/optimization create+poll) shared by every screen that records
   an official result (Simulation, Optimization, Guided Setup, Run Live
   Demo). Field mappings below were verified directly against the real
   backend DTO source (api/dto/*.java, climate/dto/*.java, design/dto/*.java,
   thermal/model/SimulationResult.java), not assumed from docs. */
window.APP_ADAPTER = (function () {
  const BACKEND = window.APP_BACKEND;
  const ENGINE = window.APP_ENGINE;

  function toLocalDateTimeString(date) {
    return date.toISOString().slice(0, 19); // Java LocalDateTime has no trailing "Z"/offset
  }

  // ---- Material slug <-> numeric id -----------------------------------
  // Local design fields use stable slug strings (e.g. "wall_insulated_panel",
  // matching data.js/V2__seed_reference_data.sql); every backend write DTO
  // wants the numeric Material.id. Built once, lazily, from GET /materials.
  let materialCache = null;
  async function loadMaterialLookup(force) {
    if (materialCache && !force) return materialCache;
    const materials = await BACKEND.listMaterials();
    const bySlug = {}, byId = {};
    materials.forEach(function (m) { bySlug[m.slug] = m.id; byId[m.id] = m.slug; });
    materialCache = { bySlug: bySlug, byId: byId, all: materials };
    return materialCache;
  }

  // ---- Design <-> CreateShelterDesignRequest (verified against
  // api/dto/CreateShelterDesignRequest.java directly) -----------------------
  function designToShelterDesignRequest(design, projectId, comfortProfileId, bySlug) {
    function mid(slug) { return slug ? (bySlug[slug] || null) : null; }
    function op(o) { return { areaEach: o.areaEach, count: o.count, orientation: o.orientation, glazingMaterialId: mid(o.glazingMaterialId) }; }
    return {
      projectId: projectId,
      name: design.name,
      shape: design.shape,
      length: design.length != null ? design.length : null,
      width: design.width != null ? design.width : null,
      height: design.height != null ? design.height : null,
      diameter: design.diameter != null ? design.diameter : null,
      lengthA: design.lengthA != null ? design.lengthA : null,
      widthA: design.widthA != null ? design.widthA : null,
      lengthB: design.lengthB != null ? design.lengthB : null,
      widthB: design.widthB != null ? design.widthB : null,
      orientation: design.orientation,
      azimuthDeg: design.azimuthDeg != null ? design.azimuthDeg : null,
      wallMaterialId: mid(design.wall.materialId), wallThicknessMm: design.wall.thicknessMm,
      roofMaterialId: mid(design.roof.materialId), roofThicknessMm: design.roof.thicknessMm,
      floorMaterialId: mid(design.floor.materialId), floorThicknessMm: design.floor.thicknessMm != null ? design.floor.thicknessMm : null,
      wallInsulationMaterialId: mid(design.wall.insulationMaterialId),
      wallInsulationThicknessMm: design.wall.insulationThicknessMm != null ? design.wall.insulationThicknessMm : null,
      roofInsulationMaterialId: mid(design.roof.insulationMaterialId),
      roofInsulationThicknessMm: design.roof.insulationThicknessMm != null ? design.roof.insulationThicknessMm : null,
      airLeakageAch: design.airLeakageAch,
      comfortProfileId: comfortProfileId,
      occupancyCount: design.occupancy,
      occupancyActivity: design.occupancyActivity,
      internalHeatGainW: design.internalHeatGainW,
      groundTempC: design.groundTempC != null ? design.groundTempC : null,
      occupancySchedule: Array.isArray(design.occupancySchedule) && design.occupancySchedule.length === 24
        ? design.occupancySchedule.map(e => ({ occupancyCount: e.persons, occupancyActivity: e.activityId }))
        : null,
      windows: (design.windows || []).map(op),
      doors: (design.doors || []).map(op),
      thermalMass: design.thermalMass ? {
        materialId: mid(design.thermalMass.materialId), massKg: design.thermalMass.massKg,
        surfaceAreaM2: design.thermalMass.surfaceAreaM2, exposure: design.thermalMass.exposure
      } : null
    };
  }

  // Reverse of the above, from GET /shelter-designs/{id}'s detail response.
  // `comfort` is intentionally left for the caller to fill in (needs a
  // separate comfort-profile lookup by id — no comfortProfileId is nested
  // detail alone can resolve to real min/max/clothing values).
  function shelterDesignDetailToDesign(detail, byId) {
    function slug(id) { return id != null ? (byId[id] || null) : null; }
    function op(o) { return { areaEach: o.areaEach, count: o.count, orientation: o.orientation, glazingMaterialId: slug(o.glazingMaterialId) }; }
    return {
      name: detail.name, shape: detail.shape,
      length: detail.length, width: detail.width, height: detail.height, diameter: detail.diameter,
      lengthA: detail.lengthA, widthA: detail.widthA, lengthB: detail.lengthB, widthB: detail.widthB,
      orientation: detail.orientation, azimuthDeg: detail.azimuthDeg,
      wall: { materialId: slug(detail.wallMaterialId), thicknessMm: detail.wallThicknessMm, insulationMaterialId: slug(detail.wallInsulationMaterialId), insulationThicknessMm: detail.wallInsulationThicknessMm },
      roof: { materialId: slug(detail.roofMaterialId), thicknessMm: detail.roofThicknessMm, insulationMaterialId: slug(detail.roofInsulationMaterialId), insulationThicknessMm: detail.roofInsulationThicknessMm },
      floor: { materialId: slug(detail.floorMaterialId), thicknessMm: detail.floorThicknessMm },
      windows: (detail.windows || []).map(op),
      doors: (detail.doors || []).map(op),
      airLeakageAch: detail.airLeakageAch,
      thermalMass: detail.thermalMass ? { materialId: slug(detail.thermalMass.materialId), massKg: detail.thermalMass.massKg, surfaceAreaM2: detail.thermalMass.surfaceAreaM2, exposure: detail.thermalMass.exposure } : null,
      occupancy: detail.occupancyCount, occupancyActivity: detail.occupancyActivity,
      occupancySchedule: Array.isArray(detail.occupancySchedule) && detail.occupancySchedule.length === 24
        ? detail.occupancySchedule.map(e => ({ persons: e.occupancyCount, activityId: e.occupancyActivity }))
        : null,
      internalHeatGainW: detail.internalHeatGainW, groundTempC: detail.groundTempC,
      comfort: null
    };
  }

  // ---- Simulation result shapes ------------------------------------------
  // SimulationSummary is a verified, literal 1:1 field mirror of engine.js's
  // runSimulation() return object (thermal/model/SimulationResult.java's own
  // doc comment) minus `series`, which the backend paginates separately —
  // so the only real work is re-attaching a series array in the same shape.
  function simulationSummaryToEngineResult(summary, series) {
    return Object.assign({}, summary, { series: series || [] });
  }

  // Backend SeriesPointResponse -> engine.js's SeriesPoint shape. Two fields
  // the backend doesn't persist per-step (raw solar irradiance `gHoriz`,
  // separate window/door conduction) are covered by design decision: Explain
  // Calculation recomputes locally instead of reading this series (see
  // explainLocalRecompute) specifically because of this gap.
  function seriesRawToEngineSeries(rawItems, timeStepMinutes) {
    return (rawItems || []).map(function (p) {
      return {
        hourDecimal: (p.tsOffsetMinutes / 60) % 24,
        stepIndex: Math.round(p.tsOffsetMinutes / timeStepMinutes),
        tAmb: num(p.ambientTempC), tIndoor: num(p.indoorTempC), tMass: num(p.massTempC),
        gHoriz: 0, // not persisted server-side — see explainLocalRecompute
        qSolarWindow: num(p.solarGainW),
        qWall: num(p.wallLossW), qRoof: num(p.roofLossW), qFloor: num(p.floorLossW),
        // Backend permanently combines window+door conduction into one
        // column; putting the full value on qWindowCond and 0 on qDoorCond
        // keeps every existing "qWindowCond + qDoorCond" total correct.
        qWindowCond: num(p.openingLossW), qDoorCond: 0,
        qVent: num(p.ventLossW), qMassExchange: num(p.massExchangeW),
        qInternal: 0, // not persisted per-step; daily.internalKwh still reflects it in aggregate
        qNet: num(p.netBalanceW), inComfort: !!p.inComfortBand
      };
    });
    function num(v) { return v == null ? 0 : Number(v); } // BigDecimal fields arrive as JSON numbers or numeric strings depending on Jackson config
  }

  // Purely local, never recorded/saved: re-runs the verified physics engine
  // once on the exact design/season/simConfig that produced the official
  // backend result, only to access per-step fields (gHoriz, split opening
  // losses) the backend doesn't persist. Mathematically identical output —
  // not a competing source of truth, just a richer view for the modal.
  function explainLocalRecompute(state) {
    const season = window.APP_STORE.currentSeason();
    if (!season) return null;
    return ENGINE.runSimulation(state.design, season, state.simConfig);
  }

  // ---- Optimization candidate shapes ---------------------------------
  // Backend candidate scores (comfortScore/retentionScore/.../weightedTotalScore)
  // are confirmed 0-100 scale directly from OptimizationEngine.java source
  // ("double comfort = result.scores().comfortScore()", itself a 0-100 field
  // per SimulationResult.Scores) — the exact same scale the local engine
  // already uses, no rescaling needed.
  //
  // Every candidate in one run shares the base design's shape/dimensions —
  // OptimizationEngine only ever varies wall/roof material, orientation,
  // windows and mass (confirmed in OptimizationRunService's own comment) —
  // so the base design is cloned and only those fields are overridden from
  // the candidate's designSummary, rather than needing a per-candidate
  // shelter-design detail fetch (which wouldn't scale to hundreds of rows).
  function designCandidateToLocalCandidate(c, baseDesign) {
    const ds = c.designSummary || {};
    const design = JSON.parse(JSON.stringify(baseDesign));
    design.wall = Object.assign({}, design.wall, {
      materialId: ds.wallMaterialSlug || design.wall.materialId,
      insulationMaterialId: ds.wallInsulationMaterialSlug || null,
      insulationThicknessMm: ds.wallInsulationThicknessMm != null ? Number(ds.wallInsulationThicknessMm) : null
    });
    design.roof = Object.assign({}, design.roof, {
      materialId: ds.roofMaterialSlug || design.roof.materialId,
      insulationMaterialId: ds.roofInsulationMaterialSlug || null,
      insulationThicknessMm: ds.roofInsulationThicknessMm != null ? Number(ds.roofInsulationThicknessMm) : null
    });
    design.orientation = ds.orientation || design.orientation;
    if (ds.windowAreaM2 != null && ds.windowCount) {
      const existingOrientation = (design.windows && design.windows[0] && design.windows[0].orientation) || "FRONT";
      design.windows = [{
        areaEach: Number(ds.windowAreaM2) / ds.windowCount, count: ds.windowCount,
        orientation: existingOrientation, glazingMaterialId: ds.glazingMaterialSlug || null
      }];
    }
    design.thermalMass = ds.thermalMassKg != null
      ? Object.assign({}, design.thermalMass || { surfaceAreaM2: 0, exposure: "FLOOR" },
          { massKg: Number(ds.thermalMassKg), materialId: ds.thermalMassMaterialSlug || (design.thermalMass && design.thermalMass.materialId) || null })
      : null;

    return {
      label: c.label, isRecommended: !!c.isRecommended,
      params: {
        wall: ds.wallMaterialSlug, roof: ds.roofMaterialSlug, orient: ds.orientation,
        insul: ds.wallInsulationThicknessMm != null ? Number(ds.wallInsulationThicknessMm) : 0,
        wpct: ds.windowPercentOfWallArea != null ? Number(ds.windowPercentOfWallArea) : 0,
        glz: ds.glazingMaterialSlug, mass: ds.thermalMassKg != null ? Number(ds.thermalMassKg) : 0
      },
      design: design,
      score: {
        comfort: Number(c.comfortScore), retention: Number(c.retentionScore), solar: Number(c.solarScore),
        energyScore: Number(c.energyScore), costScore: Number(c.costScore), total: Number(c.weightedTotalScore)
      },
      cost: Number(c.estimatedCostInr),
      result: null // filled in by the caller (top-5 + recommended only) via a local recompute
    };
  }

  // Builds the full local-shaped optimization result from the backend's
  // response. Only the top-5 + recommended get `.result` (a full physics
  // breakdown) — filled by running the verified engine locally, once per
  // candidate, on the reconstructed design (cheap: ~6 calls, mathematically
  // identical to the backend since it's the same verified port on the same
  // inputs — not a competing source of truth, just detail the backend's
  // flat scores don't carry). The full `all` list (hundreds of rows) stays
  // scores+params only, matching what the UI's own "All Evaluated" table
  // and CSV export already use.
  function optimizationRunToEngineResult(run, baseDesign, season, simConfig) {
    const rawAll = run.all || [];
    const topIds = (run.top || []).map(c => c.id);
    const recommendedId = run.recommended && run.recommended.id;

    // rank must be assigned by score order (best first) — the "All Evaluated
    // Candidates" table and its CSV export both derive the recommended-row
    // highlight from `rank === 1`, matching the local engine's own
    // convention, not `isRecommended` directly.
    const sortedRaw = [...rawAll].sort((a, b) => Number(b.weightedTotalScore) - Number(a.weightedTotalScore));
    const byId = {};
    const all = sortedRaw.map((c, i) => {
      const candidate = designCandidateToLocalCandidate(c, baseDesign);
      candidate.rank = i + 1;
      byId[c.id] = candidate;
      return candidate;
    });

    all.forEach((candidate, i) => {
      const id = sortedRaw[i].id;
      if (topIds.indexOf(id) !== -1 || id === recommendedId) {
        candidate.result = ENGINE.runSimulation(candidate.design, season, simConfig);
      }
    });
    const top = topIds.map(id => byId[id]).filter(Boolean);
    const recommended = recommendedId != null ? byId[recommendedId] : null;
    return {
      candidatesEvaluated: run.candidatesEvaluated, usedMlScreening: !!run.usedMlScreening,
      mlScreenedFrom: run.mlScreenedFrom || null,
      top: top, recommended: recommended, all: all
    };
  }

  // ---- Climate profile request (verified against
  // climate/dto/CreateClimateProfileRequest.java + HourlyPointRequest.java,
  // built from the shape weather-api.js's fetchOpenMeteo() actually returns) --
  function climateProfileRequestFromSeason(locationId, season) {
    return {
      locationId: locationId,
      ambientTempMinC: season.tMin, ambientTempMaxC: season.tMax,
      avgTempCAnnual: season.avgTempCAnnual != null ? season.avgTempCAnnual : null,
      solarIrradianceKwhM2Yr: season.solarKwhDay != null ? Math.round(season.solarKwhDay * 365 * 100) / 100 : null,
      sunshineHoursPerDay: (season.sunset != null && season.sunrise != null) ? Math.round((season.sunset - season.sunrise) * 10) / 10 : null,
      avgWindSpeedMs: season.windMs != null ? season.windMs : null,
      avgRelativeHumidityPct: season.rhPct != null ? season.rhPct : null,
      avgCloudCoverPct: season.cloudPct != null ? season.cloudPct : null,
      version: "open-meteo-" + (season.period || "forecast"),
      hourly: (season.hourly || []).map(function (h) {
        return {
          tsOffsetMinutes: Math.round(h.hourDecimal * 60),
          ambientTempC: h.temp, solarIrradianceWm2: h.solar,
          windSpeedMs: h.windMs, relativeHumidityPct: h.rhPct
        };
      })
    };
  }

  // ---- Persistence orchestration (just-in-time create, cached in
  // state.backend so repeat runs update in place rather than duplicating) --
  async function ensureProject(state) {
    if (state.backend.projectId) return state.backend.projectId;
    const created = await BACKEND.createProject({ name: state.project.name, description: null });
    state.backend.projectId = created.id;
    window.APP_STORE.save();
    return created.id;
  }

  // No PUT /comfort-profiles/{id} exists server-side, so a genuine value
  // change creates a fresh row (old rows are simply left unused) rather than
  // silently drifting stale — a small, documented simplification, not a bug.
  async function ensureComfortProfile(state, projectId) {
    const c = state.design.comfort;
    if (state.backend.comfortProfileId && state.backend._comfortMin === c.min && state.backend._comfortMax === c.max) {
      return state.backend.comfortProfileId;
    }
    const created = await BACKEND.createComfortProfile({
      projectId: projectId, profileType: "HUMAN_OCCUPANCY",
      name: "Human comfort", comfortMinC: c.min, comfortMaxC: c.max, notes: null
    });
    state.backend.comfortProfileId = created.id;
    state.backend._comfortMin = c.min;
    state.backend._comfortMax = c.max;
    window.APP_STORE.save();
    return created.id;
  }

  async function ensureLocation(state, projectId) {
    if (!state.location) throw new Error("Set a location before running a simulation.");
    if (state.backend.locationId && state.backend._locationKey === state.locationKey) return state.backend.locationId;
    const loc = state.location;
    const created = await BACKEND.createLocation({
      projectId: projectId,
      country: loc.country || null, state: loc.state || null, district: loc.district || null, village: null,
      latitude: loc.latitude, longitude: loc.longitude,
      elevationM: loc.elevationM != null ? loc.elevationM : null
    });
    state.backend.locationId = created.id;
    state.backend._locationKey = state.locationKey;
    state.backend.climateProfileId = null; // a new location needs a fresh climate profile too
    window.APP_STORE.save();
    return created.id;
  }

  async function ensureClimateProfile(state, projectId, locationId) {
    if (state.backend.climateProfileId) return state.backend.climateProfileId;
    const season = window.APP_STORE.currentSeason();
    if (!season) throw new Error("No climate data loaded for this location yet.");
    const created = await BACKEND.createClimateProfile(climateProfileRequestFromSeason(locationId, season));
    state.backend.climateProfileId = created.id;
    window.APP_STORE.save();
    return created.id;
  }

  async function saveShelterDesign(state, projectId, comfortProfileId) {
    const lookup = await loadMaterialLookup();
    const req = designToShelterDesignRequest(state.design, projectId, comfortProfileId, lookup.bySlug);
    let result;
    if (state.backend.shelterDesignId) {
      result = await BACKEND.updateShelterDesign(state.backend.shelterDesignId, req);
      if (!result || !result.id) result = { id: state.backend.shelterDesignId };
    } else {
      result = await BACKEND.createShelterDesign(projectId, req);
    }
    state.backend.shelterDesignId = result.id;
    window.APP_STORE.save();
    return result.id;
  }

  // Ensures every prerequisite (project/comfort/location/climate/design) is
  // persisted, in the required dependency order. Shared by anything that
  // needs a fully backend-persisted state before creating a simulation or
  // optimization run.
  async function ensureAllPersisted(state, notify) {
    const projectId = await ensureProject(state);
    notify("Saving comfort profile…");
    const comfortProfileId = await ensureComfortProfile(state, projectId);
    notify("Saving location…");
    const locationId = await ensureLocation(state, projectId);
    notify("Saving climate profile…");
    const climateProfileId = await ensureClimateProfile(state, projectId, locationId);
    notify("Saving shelter design…");
    const shelterDesignId = await saveShelterDesign(state, projectId, comfortProfileId);
    return { projectId, comfortProfileId, locationId, climateProfileId, shelterDesignId };
  }

  // ---- Load a saved project back from the backend -------------------------
  // Reconstructs project + design + comfort fully. Location is restored as
  // identity only (label/coordinates) — NOT the full hourly climate series:
  // the backend has no "get one climate profile's full hourly detail"
  // endpoint (only a list-summary), and re-fetching live weather is more
  // honest than resurrecting a possibly-stale persisted copy anyway (see
  // ARCHITECTURE.md's data-source transparency requirement). The Location &
  // Climate screen's existing "no climate loaded" empty state naturally
  // covers this — the user re-loads weather for the restored coordinates
  // with one click, same as opening a fresh location.
  async function loadProjectFromBackend(projectId) {
    const project = await BACKEND.getProject(projectId);
    const designs = await BACKEND.listShelterDesigns(projectId);
    const comfortProfiles = await BACKEND.listComfortProfiles(projectId);
    const locations = await BACKEND.listLocations(projectId);
    const lookup = await loadMaterialLookup();

    const state = window.APP_STORE.freshState();
    state.backend.projectId = projectId;
    state.project.name = project.name;

    // Most-recently-created of each (highest id) — a project only ever has
    // one "current" design/location in this app's local model, so this is
    // the closest available proxy for "the one last worked on."
    if (designs.length) {
      const latest = designs.reduce(function (a, b) { return b.id > a.id ? b : a; });
      const detail = await BACKEND.getShelterDesign(latest.id);
      state.design = shelterDesignDetailToDesign(detail, lookup.byId);
      state.backend.shelterDesignId = detail.id;
      const cp = comfortProfiles.find(function (c) { return c.id === detail.comfortProfileId; });
      state.design.comfort = cp
        ? { profileId: "human", baseMin: Number(cp.comfortMinC), max: Number(cp.comfortMaxC), clothingLevel: "WINTER", activityLevel: "SEATED", min: Number(cp.comfortMinC) }
        : window.APP_STORE.defaultDesign().comfort;
      if (cp) { state.backend.comfortProfileId = cp.id; state.backend._comfortMin = Number(cp.comfortMinC); state.backend._comfortMax = Number(cp.comfortMaxC); }
    }

    if (locations.length) {
      const loc = locations.reduce(function (a, b) { return b.id > a.id ? b : a; });
      state.locationKey = "custom";
      state.location = {
        key: "custom", label: [loc.village, loc.district, loc.state].filter(Boolean).join(", ") || "Saved location",
        country: loc.country || "", state: loc.state || "", district: loc.district || "",
        latitude: Number(loc.latitude), longitude: Number(loc.longitude),
        elevationM: loc.elevationM != null ? Number(loc.elevationM) : null,
        elevationSource: null, soilSurface: null, annualSolarKwhM2Yr: null,
        avgSunshineHoursDay: null, avgCloudFreeDays: null, solarDataSource: null,
        seasons: {} // deliberately empty — see function doc comment above
      };
      state.seasonKey = "Winter"; // matches freshState()'s default; seasons{} being empty makes currentSeason() correctly return undefined
      state.climateSource = null;
      state.backend.locationId = loc.id;
    }

    return state;
  }

  // ---- Official (backend-computed, recorded) simulation run --------------
  async function runOfficialSimulation(state, onStatus) {
    const notify = onStatus || function () {};
    const ids = await ensureAllPersisted(state, notify);
    const days = (state.simConfig && state.simConfig.days) || 1;
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + days * 24 * 3600 * 1000);

    notify("Queuing simulation…");
    const auth = BACKEND.getAuth();
    const created = await BACKEND.createSimulation({
      projectId: ids.projectId, shelterDesignId: ids.shelterDesignId, climateProfileId: ids.climateProfileId,
      timeStepMinutes: state.simConfig.timeStepMinutes, periodType: state.simConfig.periodType,
      startAt: toLocalDateTimeString(startAt), endAt: toLocalDateTimeString(endAt),
      runByUserId: auth ? auth.userId : null
    });
    state.backend.lastSimulationId = created.id;
    window.APP_STORE.save();

    notify("Running simulation on the server…");
    const finalStatus = await BACKEND.pollSimulation(created.id);
    if (finalStatus.status === "FAILED") throw new Error("The simulation failed on the server — check the design for invalid values.");

    notify("Fetching results…");
    const rawSeries = await BACKEND.getFullSimulationSeries(created.id);
    const series = seriesRawToEngineSeries(rawSeries, state.simConfig.timeStepMinutes);
    return simulationSummaryToEngineResult(finalStatus.summary, series);
  }

  // ---- Official (backend-computed, recorded) optimization run ------------
  async function runOfficialOptimization(state, weights, broaderSearch, onStatus) {
    const notify = onStatus || function () {};
    const ids = await ensureAllPersisted(state, notify);

    notify("Queuing optimization run…");
    const created = await BACKEND.createOptimizationRun({
      projectId: ids.projectId, baseShelterDesignId: ids.shelterDesignId, climateProfileId: ids.climateProfileId,
      timeStepMinutes: state.simConfig.timeStepMinutes, periodType: state.simConfig.periodType,
      weights: weights, broaderSearch: !!broaderSearch
    });
    state.backend.lastOptimizationRunId = created.id;
    window.APP_STORE.save();

    notify("Evaluating candidates on the server (this can take up to a minute)…");
    const finalStatus = await BACKEND.pollOptimizationRun(created.id, { timeoutMs: 180000 });
    if (finalStatus.status === "FAILED") throw new Error("The optimization run failed on the server.");

    notify("Fetching results…");
    const season = window.APP_STORE.currentSeason();
    return optimizationRunToEngineResult(finalStatus, state.design, season, state.simConfig);
  }

  return {
    loadMaterialLookup,
    designToShelterDesignRequest, shelterDesignDetailToDesign,
    simulationSummaryToEngineResult, seriesRawToEngineSeries, explainLocalRecompute,
    designCandidateToLocalCandidate, optimizationRunToEngineResult,
    climateProfileRequestFromSeason, loadProjectFromBackend,
    ensureProject, ensureComfortProfile, ensureLocation, ensureClimateProfile, saveShelterDesign,
    ensureAllPersisted, runOfficialSimulation, runOfficialOptimization, toLocalDateTimeString
  };
})();
