/* AreaTherm UI — Dashboard, Location & Climate, Shelter Designer, Materials */
window.UI = window.UI || {};

(function () {
  const CFG = window.APP_CONFIG, DATA = window.APP_DATA, ENGINE = window.APP_ENGINE, STORE = window.APP_STORE, CH = window.APP_CHARTS;

  const heroHtml = (compact) => `
    <div class="hero" style="${compact ? "padding:22px 28px;" : ""}">
      <span class="tag tag-model" style="margin-bottom:10px;">Physics-based decision-support platform</span>
      <h1 style="${compact ? "font-size:20px;" : ""}">Design Shelters for the Climate Around Them.</h1>
      <p>An area-specific, physics-based software platform for predicting thermal performance and
      optimizing passive shelter design — starting with Ladakh.</p>
      ${compact ? "" : `<div class="flow">
        <span class="step">CLIMATE</span><span class="arrow">↓</span>
        <span class="step">DESIGN</span><span class="arrow">↓</span>
        <span class="step">MATERIALS</span><span class="arrow">↓</span>
        <span class="step">SIMULATION</span><span class="arrow">↓</span>
        <span class="step">OPTIMIZATION</span><span class="arrow">↓</span>
        <span class="step">RECOMMENDATION</span>
      </div>`}
      <div class="cta-row">
        <button class="btn btn-accent" id="heroDemoBtn">▶ Run Live Demo</button>
        <button class="btn" id="heroWorkflowBtn" style="background:transparent;border-color:rgba(255,255,255,.4);color:#fff;">Start Guided Setup →</button>
      </div>
    </div>`;

  const EXPLORE_TILES = [
    { route: "guided", icon: "🧭", title: "Guided Setup", desc: "A 5-step wizard from location to results — the fastest way to run your first simulation." },
    { route: "location", icon: "🌐", title: "Location & Climate", desc: "Pick from 10 reference locations and load live weather + solar climatology." },
    { route: "designer", icon: "📐", title: "Shelter Designer", desc: "Define shape, geometry and orientation for the shelter." },
    { route: "materials", icon: "🧱", title: "Materials", desc: "Choose wall, roof, insulation, thermal-mass and glazing materials." },
    { route: "simulation", icon: "🌡️", title: "Thermal Simulation", desc: "Run the hourly heat-balance model — indoor temperature, solar gain, heat flow." },
    { route: "optimization", icon: "📊", title: "Optimization", desc: "Automatically rank design candidates by comfort, heat retention and cost." },
    { route: "whatif", icon: "🔀", title: "What-If Analysis", desc: "Change one parameter and see its effect on comfort, instantly." },
    { route: "validation", icon: "✅", title: "Validation", desc: "Compare model predictions against your own measured readings." },
    { route: "reports", icon: "📄", title: "Reports", desc: "Generate a printable engineering report for the recommended design." },
    { route: "evaluator", icon: "🗒️", title: "Evaluator Summary", desc: "A 2–3 minute story of the problem, the model and the recommended design." },
    { route: "settings", icon: "⚙️", title: "Settings", desc: "Units, assumptions & limitations — what's real vs. a documented model assumption." }
  ];

  UI.renderDashboard = function (root) {
    const s = STORE.get();
    const hist = s.simulationHistory;

    root.innerHTML = `
      ${heroHtml(hist.length > 0)}

      ${s.location ? `<div class="card" style="margin:18px 0;">
          ${U.badge(s.climateSource)} <span class="hint">for ${U.esc(s.location.label)}</span>
          ${s.location.solarDataSource ? `<div class="hint" style="margin-top:6px;">Solar potential: <b>${s.location.annualSolarKwhM2Yr} kWh/m²/yr</b> · Avg. temp: <b>${s.location.avgTempCAnnual}°C</b> — NASA POWER (${U.esc(s.location.solarDataSource.period)})</div>` : ""}
        </div>` : ""}

      <button class="hamburger-toggle" id="exploreToggle" aria-expanded="false" style="margin-top:${s.location ? "0" : "22px"};">
        <span class="hamburger-icon">☰</span> Explore the Platform
      </button>
      <div class="explore-body" id="exploreBody">
        <p class="subtitle">Every screen, one click away — pick a starting point.</p>
        <div class="grid grid-3">
          ${EXPLORE_TILES.map(t => `
            <a class="nav-tile" href="#/${t.route}" data-route="${t.route}">
              <div class="nav-tile-icon">${t.icon}</div>
              <div class="nav-tile-title">${U.esc(t.title)}</div>
              <div class="nav-tile-desc">${U.esc(t.desc)}</div>
            </a>`).join("")}
        </div>
      </div>`;

    U.on("#heroDemoBtn", "click", () => window.APP.runLiveDemo(), root);
    U.on("#heroWorkflowBtn", "click", () => window.APP.navigate("guided"), root);
    U.on("#exploreToggle", "click", () => {
      const btn = U.qs("#exploreToggle", root), body = U.qs("#exploreBody", root);
      const open = body.classList.toggle("open");
      btn.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    }, root);
    U.qsa(".nav-tile", root).forEach(el => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        window.APP.navigate(el.dataset.route);
      });
    });
  };

  // ---------------------------------------------------------------------
  function locationSelectOptions(selectedId) {
    return DATA.PREDEFINED_LOCATIONS.map(l =>
      `<option value="${l.id}" ${selectedId === l.id ? "selected" : ""}>${l.name} — ${l.elevationM}m (${l.category})</option>`
    ).join("");
  }

  const MONTH_LABEL = { JAN: "Jan", FEB: "Feb", MAR: "Mar", APR: "Apr", MAY: "May", JUN: "Jun", JUL: "Jul", AUG: "Aug", SEP: "Sep", OCT: "Oct", NOV: "Nov", DEC: "Dec" };

  function ventilationNeed(rhPct) {
    if (!Number.isFinite(rhPct)) return "—";
    if (rhPct > 70) return "High — increase ACH to manage moisture buildup";
    if (rhPct > 50) return "Moderate — standard ACH is adequate";
    return "Low — minimise ACH in this dry climate to reduce unnecessary heat loss";
  }

  // Simple, transparent rule-based planning heuristic — NOT a certified
  // engineering recommendation, and not from any external design-code
  // lookup. Each bullet is conditioned on the actual fetched numbers so the
  // list changes per location rather than being fixed boilerplate.
  function buildDesignImplications(season) {
    const bullets = [];
    const swing = season.tMax - season.tMin;
    if (swing > 15) bullets.push(`Large diurnal swing (${swing.toFixed(0)}°C) — thermal mass will meaningfully smooth night-time lows; consider stone, water drums, or a PCM.`);
    if (season.tMin < 5) bullets.push("Cold climate — prioritise wall/roof insulation thickness and minimise unshaded glazing on non-south faces.");
    if (season.tMax > 32) bullets.push("Hot daytime peaks — minimise west-facing glazing and consider a higher-reflectivity roof finish to cut solar gain.");
    if (season.rhPct > 65) bullets.push("High average humidity — allow for extra ventilation to manage moisture.");
    if (season.cloudPct > 55) bullets.push("High average cloud cover — solar gain will be limited; do not oversize glazing expecting full-sun performance.");
    if (season.windMs > 4) bullets.push("Elevated average wind speed — infiltration losses rise with wind; prioritise airtightness detailing.");
    bullets.push("South-facing orientation typically captures the most low-angle winter sun at Indian latitudes (all reference locations are in the Northern Hemisphere).");
    return bullets;
  }

  function renderClimateCards(root, s, season) {
    const box = U.qs("#climateSummaryBox", root);
    if (!box) return;
    if (!season) { box.innerHTML = `<p class="subtitle">No climate loaded yet.</p>`; return; }
    const loc = s.location;
    const nasa = loc && loc.solarDataSource;
    const seasonKeys = loc ? Object.keys(loc.seasons) : [];
    const showSeasonPicker = seasonKeys.length > 1;

    let coldestMonth = null, hottestMonth = null, bestHeatingMonths = [], lowestSolarMonths = [];
    if (nasa && nasa.monthlyTemp && nasa.monthlyGhi) {
      const mt = nasa.monthlyTemp;
      const validTemp = mt.filter(m => Number.isFinite(m.tempC));
      if (validTemp.length) {
        coldestMonth = validTemp.reduce((a, b) => b.tempC < a.tempC ? b : a, validTemp[0]);
        hottestMonth = validTemp.reduce((a, b) => b.tempC > a.tempC ? b : a, validTemp[0]);
        const meanT = validTemp.reduce((sum, m) => sum + m.tempC, 0) / validTemp.length;
        const coldHalfGhi = nasa.monthlyGhi.filter((m, i) => mt[i] && Number.isFinite(mt[i].tempC) && mt[i].tempC <= meanT && Number.isFinite(m.kwhM2Day));
        bestHeatingMonths = [...coldHalfGhi].sort((a, b) => b.kwhM2Day - a.kwhM2Day).slice(0, 3).map(m => MONTH_LABEL[m.month] || m.month);
      }
      lowestSolarMonths = [...nasa.monthlyGhi].filter(m => Number.isFinite(m.kwhM2Day)).sort((a, b) => a.kwhM2Day - b.kwhM2Day).slice(0, 3).map(m => MONTH_LABEL[m.month] || m.month);
    }

    box.innerHTML = `
      ${U.badge(s.climateSource)}
      ${showSeasonPicker ? `
      <div class="form-row" style="max-width:220px; margin-top:10px;"><label>Season</label>
        <select id="seasonSwitch">${seasonKeys.map(k => `<option value="${k}" ${s.seasonKey === k ? "selected" : ""}>${k}</option>`).join("")}</select>
      </div>` : ""}

      <div class="grid grid-2" style="margin-top:12px;">
        <div class="card card-tight">
          <h3>Temperature Profile</h3>
          <div class="metric-value" style="font-size:18px;">${season.tMin} to ${season.tMax} °C</div>
          <div class="hint">Diurnal swing: <b>${(season.tMax - season.tMin).toFixed(0)}°C</b></div>
          ${nasa && coldestMonth ? `
          <div class="hint">Coldest month (avg): <b>${MONTH_LABEL[coldestMonth.month]}</b> (${coldestMonth.tempC.toFixed(1)}°C) · Hottest: <b>${MONTH_LABEL[hottestMonth.month]}</b> (${hottestMonth.tempC.toFixed(1)}°C)</div>` : `<div class="hint">Monthly breakdown needs NASA POWER climatology (see badge above).</div>`}
        </div>
        <div class="card card-tight">
          <h3>Solar Potential</h3>
          ${nasa ? `
          <div class="metric-value" style="font-size:18px;">${loc.annualSolarKwhM2Yr} kWh/m²/yr</div>
          <div class="hint">Best months for heating (cold + sunny): <b>${bestHeatingMonths.join(", ") || "—"}</b></div>
          <div class="hint">Lowest-solar months (seasonal cloud cover): <b>${lowestSolarMonths.join(", ") || "—"}</b></div>` : `
          <div class="metric-value" style="font-size:18px;">${season.solarKwhDay} kWh/m²/day</div>
          <div class="hint">Live forecast average — annual climatology unavailable right now.</div>`}
        </div>
        <div class="card card-tight">
          <h3>Humidity &amp; Wind</h3>
          <div class="metric-value" style="font-size:18px;">${season.rhPct}% RH · ${season.windMs} m/s</div>
          <div class="hint">Ventilation need: <b>${ventilationNeed(season.rhPct)}</b></div>
          <div class="hint">Avg. precipitation: <b>${season.precipMmDayAvg != null ? season.precipMmDayAvg + " mm/day" : "—"}</b> (7-day forecast average)</div>
          <div class="hint">Cloud cover: <b>${season.cloudPct}%</b></div>
        </div>
        <div class="card card-tight">
          <h3>Design Implications <span class="tag tag-demo">auto-generated heuristic</span></h3>
          <ul class="checklist" style="font-size:12px;">
            ${buildDesignImplications(season).map(b => `<li>${U.esc(b)}</li>`).join("")}
          </ul>
        </div>
      </div>
      ${(() => {
        const zone = U.classifyClimate(s.location, season);
        const recs = U.climateRecommendations(s.location, season);
        if (!recs.length) return "";
        return `
        <div class="card" style="margin-top:14px; background:var(--bg);">
          <h3>Design Tips for This Climate ${zone ? `<span class="tag tag-model">${U.esc(zone)}</span>` : ""}</h3>
          <ul class="checklist">
            ${recs.map(r => `<li><b>${U.esc(r.text)}</b> — ${U.esc(r.reason)}</li>`).join("")}
          </ul>
          <p class="hint" style="margin-top:6px;">Rule-based guidance derived from this location's own loaded climate numbers, not a lookup table of per-city advice.</p>
        </div>`;
      })()}

      ${nasa && (nasa.dniKwhM2DayAnnual || nasa.difKwhM2DayAnnual) ? `
      <div class="data-badge real" style="margin-top:12px;">✓ Annual solar potential: <b>${U.esc(String(loc.annualSolarKwhM2Yr))} kWh/m²/yr</b>
        (GHI ${nasa.ghiKwhM2DayAnnual.toFixed(2)}, DNI ${nasa.dniKwhM2DayAnnual != null ? nasa.dniKwhM2DayAnnual.toFixed(2) : "—"}, Diffuse ${nasa.difKwhM2DayAnnual != null ? nasa.difKwhM2DayAnnual.toFixed(2) : "—"} kWh/m²/day)
        — ${U.esc(nasa.label)}, ${U.esc(nasa.period)}</div>
      ` : (s.climateSource && s.climateSource.type !== "STALE_CACHED" ? `
      <div class="data-badge illustrative" style="margin-top:12px;">⚠ Annual solar figure (${loc.annualSolarKwhM2Yr} kWh/m²/yr) is extrapolated from the current 7-day forecast, not a real climatology — NASA POWER climatology fetch unavailable.</div>
      ` : "")}

      <h3 style="margin-top:16px;">24-Hour Ambient Temperature &amp; Solar Irradiance ${season.hourly ? "(live hourly curve)" : "(model input curve)"}</h3>
      <div id="climateChart"></div>
      ${s.location && s.location.solarDataSource && s.location.solarDataSource.monthlyTemp ? `
      <h3 style="margin-top:20px;">Monthly Climate Normals <span class="tag tag-model">NASA POWER, ${U.esc(s.location.solarDataSource.period)}</span></h3>
      <div class="grid grid-2">
        <div><p class="hint">Monthly mean temperature</p><div id="monthlyTempChart"></div></div>
        <div><p class="hint">Monthly solar irradiance</p><div id="monthlySolarChart"></div></div>
      </div>
      <p class="hint" id="monthlyPeaks" style="margin-top:8px;"></p>
      ` : ""}
      `;
    const hours = Array.from({ length: 25 }, (_, i) => i);
    CH.lineChart(U.qs("#climateChart", box), [
      { name: "Ambient Temp (°C)", color: "#c93b3b", data: hours.map(h => ({ x: h, y: ENGINE.ambientTempAt(season, h) })) }
    ], { height: 200, yLabel: "°C", xLabel: "Hour of day", tempZones: true });
    const solarDiv = document.createElement("div");
    solarDiv.style.marginTop = "10px";
    U.qs("#climateChart", box).appendChild(solarDiv);
    CH.lineChart(solarDiv, [
      { name: "Solar Irradiance (W/m²)", color: "#d98a12", data: hours.map(h => ({ x: h, y: ENGINE.solarIrradianceAt(season, h) })) }
    ], { height: 180, yLabel: "W/m²", xLabel: "Hour of day" });

    if (s.location && s.location.solarDataSource && s.location.solarDataSource.monthlyTemp) {
      const monthlyTemp = s.location.solarDataSource.monthlyTemp;
      const monthlyGhi = s.location.solarDataSource.monthlyGhi;
      CH.monthlyBarChart(U.qs("#monthlyTempChart", box),
        monthlyTemp.map(m => ({ label: m.month, mean: m.tempC, min: m.tempMinC, max: m.tempMaxC })),
        { height: 220, yLabel: "°C" });
      CH.lineChart(U.qs("#monthlySolarChart", box), [
        { name: "Solar (kWh/m²/day)", color: "#d98a12", data: monthlyGhi.map((m, i) => ({ x: i, y: m.kwhM2Day })) }
      ], { height: 220, yLabel: "kWh/m²/day", xFormat: (x) => monthlyGhi[Math.round(x)] ? monthlyGhi[Math.round(x)].month : "" });
      const hottest = monthlyTemp.reduce((a, b) => (b.tempC > a.tempC ? b : a));
      const coldest = monthlyTemp.reduce((a, b) => (b.tempC < a.tempC ? b : a));
      const sunniest = monthlyGhi.reduce((a, b) => (b.kwhM2Day > a.kwhM2Day ? b : a));
      U.qs("#monthlyPeaks", box).textContent =
        `Hottest month: ${hottest.month} (${hottest.tempC.toFixed(1)}°C) · Coldest month: ${coldest.month} (${coldest.tempC.toFixed(1)}°C) · Best month for solar heating: ${sunniest.month} (${sunniest.kwhM2Day.toFixed(2)} kWh/m²/day).`;
    }

    U.on("#seasonSwitch", "change", () => {
      s.seasonKey = U.qs("#seasonSwitch", box).value;
      STORE.save();
      window.APP.render();
    }, box);
  }

  UI.renderLocation = function (root) {
    const s = STORE.get();
    const loc = s.location;
    const season = STORE.currentSeason();

    root.innerHTML = `
      <h1>Location &amp; Climate Profile</h1>
      <p class="subtitle">Pick any of 10 reference locations, or enter custom coordinates, and load its live weather.</p>

      <div class="card">
        <h3>Select Location</h3>
        <div class="form-inline">
          <div class="form-row" style="flex:2;"><label>Reference location</label>
            <select id="locSelect">${locationSelectOptions(loc ? loc.key : null)}</select>
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-accent" id="loadRealBtn">🌐 Load Real Weather (Open-Meteo)</button>
          <span id="fetchStatus" class="hint"></span>
        </div>
        <div id="locationMap" style="height:260px; border-radius:8px; margin-top:12px; z-index:0;"></div>
        <p class="hint" style="margin-top:6px;">Click a pin to load that location's live weather. Map tiles © <a href="https://www.esri.com" target="_blank" rel="noopener" style="color:var(--accent);">Esri</a>.</p>
        <p class="hint" style="margin-top:10px;">Live weather from
        <a href="https://open-meteo.com" target="_blank" rel="noopener" style="color:var(--accent);">Open-Meteo</a>
        (no API key, cached 7 days) — a 7-day forecast averaged into a typical-day curve — plus real 20-year
        solar/temperature climatology from <a href="https://power.larc.nasa.gov" target="_blank" rel="noopener"
        style="color:var(--accent);">NASA POWER</a> and real elevation from Open-Meteo's Elevation API. No
        hand-authored or illustrative climate data ships with this app; every number here comes from a live
        source (falling back to cache, honestly labelled, if the network is briefly unavailable).</p>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Or Enter Custom Coordinates</h3>
        <p class="hint" style="margin-top:0;">Not one of the 10 reference sites? Simulate any location on Earth by lat/lon — snaps to a reference location if you're within ~30 km of one.</p>
        <div class="form-inline">
          <div class="form-row"><label>Label (optional)</label><input id="customLabel" placeholder="e.g. Project site A"></div>
          <div class="form-row"><label>Latitude</label><input id="customLat" type="number" step="0.0001" placeholder="-90 to 90"></div>
          <div class="form-row"><label>Longitude</label><input id="customLon" type="number" step="0.0001" placeholder="-180 to 180"></div>
          <div class="form-row" style="align-self:flex-end;"><button class="btn btn-accent" id="loadCustomBtn">🌐 Load Weather</button></div>
        </div>
        <div id="customStatus" class="hint"></div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Location Details</h3>
        <div class="grid grid-4">
          <div class="metric-card"><div class="metric-label">Name</div><div class="metric-value" style="font-size:16px;">${loc ? U.esc(loc.label) : "—"}</div></div>
          <div class="metric-card"><div class="metric-label">Region</div><div class="metric-value" style="font-size:16px;">${loc ? U.esc(loc.state || "—") : "—"}</div></div>
          <div class="metric-card"><div class="metric-label">Coordinates</div><div class="metric-value" style="font-size:14px;">${loc ? loc.latitude.toFixed(3) + ", " + loc.longitude.toFixed(3) : "—"}</div></div>
          <div class="metric-card"><div class="metric-label">Elevation</div><div class="metric-value" style="font-size:16px;">${loc && loc.elevationM != null ? loc.elevationM + " m" : "—"}</div>
            ${loc && loc.elevationSource ? `<div class="metric-sub">${U.esc(loc.elevationSource.label)}</div>` : ""}</div>
          <div class="metric-card"><div class="metric-label">Climate Zone</div><div class="metric-value" style="font-size:15px;">${season ? U.esc(U.classifyClimate(loc, season)) : "—"}</div></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;" id="climateSummaryBox"></div>

      ${comfortCardHtml(s, season)}`;

    renderClimateCards(root, s, season);
    initLocationMap(root);

    async function loadLocationById(id) {
      const btn = U.qs("#loadRealBtn", root);
      const statusEl = U.qs("#fetchStatus", root);
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = "Fetching live weather from Open-Meteo…";
      try {
        await STORE.loadRealClimate(id);
        window.APP.render();
        window.APP.toast("Weather loaded (" + STORE.get().climateSource.label + ").");
      } catch (e) {
        statusEl.textContent = "";
        alert("Could not fetch live weather: " + e.message + "\n\nCheck your internet connection and try again.");
        btn.disabled = false;
      }
    }

    U.on("#loadCustomBtn", "click", async () => {
      const lat = parseFloat(U.qs("#customLat", root).value);
      const lon = parseFloat(U.qs("#customLon", root).value);
      const label = U.qs("#customLabel", root).value;
      const check = ENGINE.validateCoordinates(lat, lon);
      const statusEl = U.qs("#customStatus", root);
      if (!check.valid) { statusEl.textContent = check.errors.join(" "); return; }
      const btn = U.qs("#loadCustomBtn", root);
      btn.disabled = true;
      statusEl.textContent = "Resolving location…";
      try {
        const near = DATA.nearestPredefinedLocation(lat, lon);
        if (near) {
          statusEl.textContent = `Within ~30km of ${near.name} — loading that reference location.`;
          await STORE.loadRealClimate(near.id);
        } else {
          statusEl.textContent = "Fetching live weather for these coordinates…";
          await STORE.loadCustomLocation(lat, lon, label);
        }
        window.APP.render();
        window.APP.toast(`Weather loaded (${near ? near.name : STORE.get().location.label}).`);
      } catch (e) {
        if (statusEl) statusEl.textContent = "";
        alert("Could not fetch live weather: " + e.message + "\n\nCheck your internet connection and try again.");
        if (btn) btn.disabled = false;
      }
    }, root);

    U.on("#loadRealBtn", "click", () => loadLocationById(U.qs("#locSelect", root).value), root);

    function initLocationMap(root) {
      const mapEl = U.qs("#locationMap", root);
      if (!mapEl || !window.L) return; // Leaflet failed to load (offline/CDN blocked) — map is optional, rest of the page works without it
      const map = window.L.map(mapEl, { scrollWheelZoom: false }).setView([22, 79], 5);
      // Esri's free ArcGIS Online basemap, not OSM's own tile.openstreetmap.org
      // (that raw tile server's usage policy forbids embedding it in a
      // distributed app without prior permission and rate-limits/blocks
      // automated or high-volume traffic — see osm.wiki/Blocked) and not
      // CARTO's basemaps either (their free raster tiles now require a signed-
      // up API key). Esri's service needs no key, is CORS-enabled for exactly
      // this kind of third-party embedding, and is backed by infrastructure
      // that comfortably absorbs a live-demo audience.
      window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, USGS, EPA",
        maxZoom: 12
      }).addTo(map);
      DATA.PREDEFINED_LOCATIONS.forEach(l => {
        const marker = window.L.marker([l.latitude, l.longitude]).addTo(map);
        marker.bindPopup(`<b>${U.esc(l.name)}</b><br>${l.elevationM} m — ${U.esc(l.category)}<br><button class="btn btn-accent btn-sm" style="margin-top:6px;" data-map-select="${l.id}">Load this location</button>`);
        marker.on("popupopen", () => {
          const btn = document.querySelector(`[data-map-select="${l.id}"]`);
          if (btn) btn.addEventListener("click", () => { map.closePopup(); loadLocationById(l.id); });
        });
      });
      if (loc) window.L.circleMarker([loc.latitude, loc.longitude], { radius: 8, color: "#1f8a9e", fillOpacity: 0.6 }).addTo(map).bindTooltip("Current: " + loc.label);
    }

    wireComfortCard(root);
  };

  // ---------------------------------------------------------------------
  // Comfort Requirement — human occupancy only. Base min/max plus
  // clothing/activity presets that shift the *effective* min comfort
  // temperature actually fed to the thermal engine (see DATA.effectiveComfortMin).
  function comfortCardHtml(s, season) {
    const c = s.design.comfort;
    const baseMin = c.baseMin != null ? c.baseMin : c.min;
    const clothingId = c.clothingLevel || "TYPICAL";
    const activityId = c.activityLevel || "SEATED";
    const effMin = DATA.effectiveComfortMin(baseMin, clothingId, activityId, c.max);
    const rh = season ? season.rhPct : null;
    const band = DATA.HUMIDITY_COMFORT_BAND;
    const rhOk = rh != null ? (rh >= band.min && rh <= band.max) : null;

    return `
      <div class="card" style="margin-top:16px;">
        <h3>Comfort Requirement — Human Occupancy</h3>
        <p class="subtitle">This prototype models thermal comfort for human occupants only.</p>
        <div class="form-inline">
          <div class="form-row"><label>Min comfortable temp (°C)</label><input id="comfortMin" type="number" value="${baseMin}"></div>
          <div class="form-row"><label>Max comfortable temp (°C)</label><input id="comfortMax" type="number" value="${c.max}"></div>
          <div class="form-row"><label>Clothing level</label>
            <select id="comfortClothing">${DATA.CLOTHING_LEVELS.map(cl => `<option value="${cl.id}" ${clothingId === cl.id ? "selected" : ""}>${cl.label} (${cl.clo} clo)</option>`).join("")}</select>
          </div>
          <div class="form-row"><label>Activity level</label>
            <select id="comfortActivity">${DATA.COMFORT_ACTIVITY_LEVELS.map(a => `<option value="${a.id}" ${activityId === a.id ? "selected" : ""}>${a.label} (${a.met} met)</option>`).join("")}</select>
          </div>
        </div>
        <div class="metric-card" style="max-width:300px;">
          <div class="metric-label">Effective Comfort Range</div>
          <div class="metric-value" id="effComfortValue" style="font-size:18px;">${effMin}–${c.max} °C</div>
          <div class="metric-sub">adjusted for clothing &amp; activity — this is what the simulation uses</div>
        </div>
        ${rh != null ? `<p class="hint" style="margin-top:10px;">Relative humidity: <b>${rh}% RH</b> — ${rhOk ? "within" : "outside"} the ${band.min}–${band.max}% RH band generally considered comfortable (informational; not used by the thermal model).</p>` : ""}
        <p class="hint" style="margin-top:6px;">Clothing and activity shift the minimum comfortable temperature only — a documented modelling heuristic (roughly 3–4°C per clothing/activity step), not a measured PMV/PPD result.</p>
        <button class="btn btn-accent btn-sm" id="saveComfortBtn" style="margin-top:8px;">Save comfort requirement</button>
      </div>`;
  }

  function wireComfortCard(root) {
    const recompute = () => {
      const baseMin = parseFloat(U.qs("#comfortMin", root).value);
      const max = parseFloat(U.qs("#comfortMax", root).value);
      const clothingId = U.qs("#comfortClothing", root).value;
      const activityId = U.qs("#comfortActivity", root).value;
      const effMin = DATA.effectiveComfortMin(baseMin, clothingId, activityId, max);
      const el = U.qs("#effComfortValue", root);
      if (el) el.textContent = `${effMin}–${max} °C`;
    };
    ["#comfortMin", "#comfortMax", "#comfortClothing", "#comfortActivity"].forEach(sel => {
      U.on(sel, "input", recompute, root);
      U.on(sel, "change", recompute, root);
    });
    U.on("#saveComfortBtn", "click", () => {
      const baseMin = parseFloat(U.qs("#comfortMin", root).value);
      const max = parseFloat(U.qs("#comfortMax", root).value);
      const clothingLevel = U.qs("#comfortClothing", root).value;
      const activityLevel = U.qs("#comfortActivity", root).value;
      if (!(baseMin < max)) { alert("Comfort minimum must be lower than comfort maximum."); return; }
      STORE.updateDesign({ comfort: {
        profileId: "human", baseMin, max, clothingLevel, activityLevel,
        min: DATA.effectiveComfortMin(baseMin, clothingLevel, activityLevel, max)
      } });
      window.APP.toast("Comfort requirement saved.");
    }, root);
  }

  // ---------------------------------------------------------------------
  const BEARING = { SOUTH: 180, SE: 135, EAST: 90, NE: 45, NORTH: 0, NW: 315, WEST: 270, SW: 225 };
  function bearingOf(design) {
    if (design.orientation === "CUSTOM") return (180 + (design.azimuthDeg || 0)) % 360;
    return BEARING[design.orientation] ?? 180;
  }

  // ---- 3D preview (Shelter Designer) ------------------------------------
  // Purely decorative wall-tint per material — these materials have no
  // visual-color field in the engineering data (only thermal properties),
  // so this is a deliberate illustrative choice, not a modeled property.
  const WALL_COLOR_BY_MATERIAL = {
    wall_concrete: "#b9b9b0", wall_brick: "#a85c3f", wall_stone: "#8a8378",
    wall_adobe: "#c99b6a", wall_rammed_earth: "#b08b5e", wall_mud_block: "#a97c50",
    wall_aac: "#d8d8d0", wall_insulated_panel: "#e8e8e8", wall_composite: "#c2b8a3"
  };
  let currentShelter3D = null;
  window.addEventListener("hashchange", () => {
    if (location.hash !== "#/designer" && currentShelter3D) {
      currentShelter3D.dispose();
      currentShelter3D = null;
    }
  });

  const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  function compassLabel(bearingDeg) {
    return COMPASS_8[Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8];
  }
  // Rotates (dx,dy) — relative to the shape center, pre-rotation — by
  // angleDeg the same way SVG's transform="rotate(angleDeg)" would, so
  // labels placed outside the rotated shape land in the right screen spot
  // without themselves being rotated (which would render sideways text).
  function rotatePoint(dx, dy, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    return { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
  }

  function drawShelterPreview(container, design, geom) {
    const size = 300, cx = size / 2, cy = size / 2;
    const isRound = ["CIRCULAR", "DOME", "SEMI_CIRCULAR"].includes(design.shape);
    const isLShape = design.shape === "L_SHAPE";
    // Overall bounding extent in metres — drives scale, window placement
    // and the wall/dimension labels below. For the L-shape this is wing
    // A's length by (wing A's width + wing B's length); everything else
    // in this function treats an L-shape as its bounding box, a
    // deliberate simplification for the compass/window labeling.
    let overallL, overallW;
    if (isLShape) {
      overallL = design.lengthA || 4;
      overallW = (design.widthA || 4) + (design.lengthB || 3);
    } else {
      overallL = geom.L;
      overallW = geom.W || geom.L;
    }
    const scale = Math.min(150 / Math.max(overallL, overallW), 6);
    const w = overallL * scale, h = overallW * scale;
    const bearing = bearingOf(design);
    let shapeSvg;
    if (isRound) {
      shapeSvg = `<circle cx="${cx}" cy="${cy}" r="${w / 2}" fill="#dfeef2" stroke="#1f8a9e" stroke-width="2"/>`;
    } else if (isLShape) {
      const lApx = (design.lengthA || 4) * scale, wApx = (design.widthA || 4) * scale, wBpx = Math.min((design.widthB || 3) * scale, lApx);
      const ox = cx - w / 2, oy = cy - h / 2;
      const pts = [
        [ox, oy + h], [ox + lApx, oy + h], [ox + lApx, oy + h - wApx],
        [ox + wBpx, oy + h - wApx], [ox + wBpx, oy], [ox, oy]
      ];
      shapeSvg = `<polygon points="${pts.map(p => p.join(",")).join(" ")}" fill="#dfeef2" stroke="#1f8a9e" stroke-width="2"/>`;
    } else {
      shapeSvg = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="#dfeef2" stroke="#1f8a9e" stroke-width="2"/>`;
    }

    // Window marks on the actual configured face (FRONT/BACK/LEFT/RIGHT),
    // one per window up to 6 spread evenly along that edge — not just a
    // single generic mark regardless of count.
    const win = design.windows && design.windows[0];
    const edgeOf = { FRONT: 0, PRIMARY: 0, RIGHT: 90, BACK: 180, LEFT: 270 };
    const winEdgeAngle = edgeOf[win ? win.orientation : "FRONT"] ?? 0;
    const winCount = win ? Math.min(6, Math.max(1, win.count || 1)) : 0;
    let winMarks = "";
    if (win && winCount > 0) {
      const along = winEdgeAngle % 180 === 0 ? w : h; // horizontal edges use width, vertical edges use height
      for (let i = 0; i < winCount; i++) {
        const t = (i + 1) / (winCount + 1) - 0.5; // -0.5..0.5 spread along the edge
        const markLen = Math.min(along / (winCount + 1.5), along * 0.3);
        const perp = winEdgeAngle % 180 === 0 ? { dx: t * along, dy: (winEdgeAngle === 0 ? -1 : 1) * h / 2 } : { dx: (winEdgeAngle === 90 ? 1 : -1) * w / 2, dy: t * along };
        winMarks += winEdgeAngle % 180 === 0
          ? `<rect x="${cx + perp.dx - markLen / 2}" y="${cy + perp.dy - 4}" width="${markLen}" height="8" fill="#2fb8cf"/>`
          : `<rect x="${cx + perp.dx - 4}" y="${cy + perp.dy - markLen / 2}" width="8" height="${markLen}" fill="#2fb8cf"/>`;
      }
    }

    const labelOffset = 16;
    const edges = isRound ? [] : [
      { angle: 0, dx: 0, dy: -h / 2 - labelOffset },
      { angle: 90, dx: w / 2 + labelOffset, dy: 0 },
      { angle: 180, dx: 0, dy: h / 2 + labelOffset },
      { angle: 270, dx: -w / 2 - labelOffset, dy: 0 }
    ];
    const wallLabels = edges.map(e => {
      const p = rotatePoint(e.dx, e.dy, bearing);
      const label = compassLabel(bearing + e.angle);
      return `<text x="${cx + p.x}" y="${cy + p.y + 3}" text-anchor="middle" class="chart-tick" font-size="9.5">${label}</text>`;
    }).join("");

    // Dimension labels — the front/back edge spans the Length, the
    // left/right edge spans the Width, so they're rotated by the same
    // `bearing` as the shape itself (via rotatePoint), same as the wall
    // compass labels, just at a slightly larger offset so the two don't
    // overlap.
    let dimLabels;
    if (isRound) {
      dimLabels = `<text x="${cx}" y="${cy + w / 2 + 26}" text-anchor="middle" class="chart-tick" font-size="10">⌀ ${(geom.L || geom.diameter).toFixed(1)} m</text>`;
    } else {
      // Placed at diagonal corners (both dx and dy nonzero), not along the
      // same cardinal axis as the compass letters (which always sit at
      // dx=0 or dy=0) — so the two never land on the same screen row or
      // column and clip into each other, regardless of bearing.
      const lenP = rotatePoint(w / 2 + labelOffset, -h / 2 - labelOffset, bearing);
      const widP = rotatePoint(w / 2 + labelOffset, h / 2 + labelOffset, bearing);
      dimLabels = `
        <text x="${cx + lenP.x}" y="${cy + lenP.y + 3}" text-anchor="middle" class="chart-tick" font-size="9.5">${isLShape ? "Wing A " : "L "}${(isLShape ? design.lengthA || 4 : geom.L).toFixed(1)} m</text>
        <text x="${cx + widP.x}" y="${cy + widP.y + 3}" text-anchor="middle" class="chart-tick" font-size="9.5">W ${(isLShape ? design.widthA || 4 : geom.W || geom.L).toFixed(1)} m</text>`;
    }

    const doorArea = (design.doors || []).reduce((s, d) => s + (d.areaEach || 0) * (d.count || 0), 0);
    const scaleBarPx = scale; // px per metre, already computed above
    const extraH = isLShape ? 16 : 0; // room for the extra Wing B annotation line
    const winLineY = size + 12 + extraH;
    const scaleLineY = size + 22 + extraH;

    container.innerHTML = `
      <svg viewBox="0 0 ${size} ${size + 24 + extraH}" style="width:100%;max-width:300px;height:auto;display:block;margin:0 auto;">
        <g transform="rotate(${bearing} ${cx} ${cy})">
          ${shapeSvg}
          ${winMarks}
        </g>
        ${wallLabels}
        ${dimLabels}
        <text x="${cx}" y="14" text-anchor="middle" class="chart-tick" font-size="11">N ↑</text>
        <text x="${cx}" y="${size - 6}" text-anchor="middle" class="chart-tick" font-size="10">Top-down schematic — illustrative</text>
        ${isLShape ? `<text x="${cx}" y="${size + 12}" text-anchor="middle" class="chart-tick" font-size="9.5">Wing B: ${(design.lengthB || 3).toFixed(1)}×${(design.widthB || 3).toFixed(1)} m</text>` : ""}
        <text x="${cx}" y="${winLineY}" text-anchor="middle" class="chart-tick" font-size="9.5">${winCount ? winCount + " window" + (winCount > 1 ? "s" : "") + " on " + compassLabel(bearing + winEdgeAngle) + " face" : "No windows configured"}${doorArea ? " · Door " + doorArea.toFixed(1) + " m² (face not modeled)" : ""}</text>
        <line x1="${size - 10 - scaleBarPx}" y1="${scaleLineY}" x2="${size - 10}" y2="${scaleLineY}" class="chart-axis"/>
        <text x="${size - 10 - scaleBarPx / 2}" y="${scaleLineY - 1}" text-anchor="middle" class="chart-tick" font-size="8.5">1 m</text>
      </svg>`;
  }

  UI.renderDesigner = function (root) {
    const s = STORE.get();
    const d = s.design;
    const geom = ENGINE.computeGeometry(d);
    const wallOpts = DATA.materialsByCategory("WALL").map(m => `<option value="${m.id}" ${d.wall.materialId === m.id ? "selected" : ""}>${m.name}</option>`).join("");
    const roofOpts = DATA.materialsByCategory("ROOF").map(m => `<option value="${m.id}" ${d.roof.materialId === m.id ? "selected" : ""}>${m.name}</option>`).join("");
    const glazeOpts = DATA.materialsByCategory("WINDOW").map(m => `<option value="${m.id}" ${d.windows[0].glazingMaterialId === m.id ? "selected" : ""}>${m.name} (U=${m.uValue}, SHGC=${m.shgc})</option>`).join("");

    root.innerHTML = `
      <h1>Shelter Designer</h1>
      <p class="subtitle">Define geometry, orientation, and openings. Preview updates live.</p>
      <div class="grid grid-2">
        <div class="card">
          <fieldset>
            <legend>Geometry</legend>
            <div class="form-inline">
              <div class="form-row"><label>Shape</label>
                <select id="dShape">
                  ${["RECTANGULAR","SQUARE","CIRCULAR","DOME","SEMI_CIRCULAR","L_SHAPE","CUSTOM"].map(v => `<option value="${v}" ${d.shape===v?"selected":""}>${v.replace("_"," ")}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="form-inline" id="rectFields" style="${["CIRCULAR","DOME","SEMI_CIRCULAR","L_SHAPE"].includes(d.shape)?"display:none;":""}">
              <div class="form-row"><label>Length (m)</label><input id="dLength" type="number" step="0.1" value="${d.length}"></div>
              <div class="form-row"><label>Width (m)</label><input id="dWidth" type="number" step="0.1" value="${d.width}"></div>
              <div class="form-row"><label>Height (m)</label><input id="dHeight" type="number" step="0.1" value="${d.height}"></div>
            </div>
            <div class="form-inline" id="roundFields" style="${["CIRCULAR","DOME","SEMI_CIRCULAR"].includes(d.shape)?"":"display:none;"}">
              <div class="form-row"><label>Diameter (m)</label><input id="dDiameter" type="number" step="0.1" value="${d.diameter || 5}"></div>
              <div class="form-row"><label>Height (m)</label><input id="dHeight2" type="number" step="0.1" value="${d.height}"></div>
            </div>
            <div class="form-inline" id="lshapeFields" style="${d.shape === "L_SHAPE" ? "" : "display:none;"}">
              <div class="form-row"><label>Wing A length (m)</label><input id="dLengthA" type="number" step="0.1" value="${d.lengthA || 4}"></div>
              <div class="form-row"><label>Wing A width (m)</label><input id="dWidthA" type="number" step="0.1" value="${d.widthA || 4}"></div>
              <div class="form-row"><label>Wing B length (m)</label><input id="dLengthB" type="number" step="0.1" value="${d.lengthB || 3}"></div>
              <div class="form-row"><label>Wing B width (m)</label><input id="dWidthB" type="number" step="0.1" value="${d.widthB || 3}"></div>
              <div class="form-row"><label>Height (m)</label><input id="dHeight3" type="number" step="0.1" value="${d.height}"></div>
            </div>
            ${d.shape === "L_SHAPE" ? `<p class="hint">Simplified: modeled as one thermal zone with a single combined wall face, not two independently-coupled zones. Wing B's width must be ≤ Wing A's length.</p>` : ""}
          </fieldset>
          <fieldset>
            <legend>Orientation</legend>
            <div class="form-inline">
              <div class="form-row"><label>Primary facade orientation</label>
                <select id="dOrientation">
                  ${["SOUTH","SE","EAST","NE","NORTH","NW","WEST","SW","CUSTOM"].map(v => `<option value="${v}" ${d.orientation===v?"selected":""}>${v}</option>`).join("")}
                </select>
              </div>
              <div class="form-row" id="azimuthRow" style="${d.orientation==="CUSTOM"?"":"display:none;"}"><label>Custom azimuth (° from South)</label><input id="dAzimuth" type="number" value="${d.azimuthDeg||0}"></div>
            </div>
          </fieldset>
          <fieldset>
            <legend>Openings</legend>
            <div class="form-inline">
              <div class="form-row"><label>Window area each (m²)</label><input id="dWinArea" type="number" step="0.1" value="${d.windows[0].areaEach}"></div>
              <div class="form-row"><label>Window count</label><input id="dWinCount" type="number" value="${d.windows[0].count}"></div>
              <div class="form-row"><label>Window face</label>
                <select id="dWinOrient">${["FRONT","BACK","LEFT","RIGHT"].map(v=>`<option ${d.windows[0].orientation===v?"selected":""}>${v}</option>`).join("")}</select>
              </div>
            </div>
            <div class="form-inline">
              <div class="form-row"><label>Glazing type</label><select id="dGlazing">${glazeOpts}</select></div>
              <div class="form-row"><label>Door area (m²)</label><input id="dDoorArea" type="number" step="0.1" value="${d.doors[0].areaEach}"></div>
              <div class="form-row"><label>Air leakage (ACH)</label><input id="dAch" type="number" step="0.1" value="${d.airLeakageAch}"></div>
            </div>
          </fieldset>
          <fieldset>
            <legend>Occupancy &amp; Internal Gain</legend>
            <div class="form-inline">
              <div class="form-row"><label>Occupancy (persons)</label><input id="dOccupancy" type="number" min="0" max="50" value="${d.occupancy}"></div>
              <div class="form-row"><label>Activity level</label>
                <select id="dActivity">${DATA.ACTIVITY_LEVELS.map(a => `<option value="${a.id}" ${(d.occupancyActivity||"SEATED")===a.id?"selected":""}>${a.label} (${a.watts} W/person)</option>`).join("")}</select>
              </div>
              <div class="form-row"><label>Equipment / other heat gain (W)</label><input id="dInternal" type="number" value="${d.internalHeatGainW}"></div>
            </div>
            <div id="occupancyPreview" class="hint"></div>
          </fieldset>
          <button class="btn btn-accent" id="saveDesignBtn">Save shelter design</button>
        </div>

        <div>
          <div class="card" style="text-align:center;">
            <h3>2D Preview (top-down)</h3>
            <div id="preview2d"></div>
          </div>
          <div class="card" style="margin-top:16px;">
            <h3>3D Preview <span class="tag tag-demo">illustrative — box approximation</span></h3>
            <canvas id="shelter3dCanvas" style="width:100%; height:280px; display:block; border-radius:8px; cursor:grab;"></canvas>
            <p class="hint" id="shelter3dStatus" hidden></p>
            <p class="hint" style="margin-top:6px;">Drag to rotate, scroll to zoom. The sun's position matches the shelter's actual orientation (${d.orientation}${d.orientation === "CUSTOM" ? ", " + (d.azimuthDeg || 0) + "°" : ""}). Windows are shown on the "Window face" wall set below; the door is always on the front wall (its face isn't modeled elsewhere in the app either). ${["CIRCULAR","DOME","SEMI_CIRCULAR","L_SHAPE"].includes(d.shape) ? "Shown as a bounding box — this view doesn't yet model curved or L-shaped footprints." : ""}</p>
          </div>
          <div class="card" style="margin-top:16px;">
            <h3>Derived Geometry <span class="tag tag-model">calculated</span></h3>
            <div class="grid grid-2">
              <div class="metric-card"><div class="metric-label">Floor Area</div><div class="metric-value" id="geomFloorArea" style="font-size:18px;">${geom.floorArea.toFixed(1)} m²</div></div>
              <div class="metric-card"><div class="metric-label">Volume</div><div class="metric-value" id="geomVolume" style="font-size:18px;">${geom.volume.toFixed(1)} m³</div></div>
              <div class="metric-card"><div class="metric-label">Wall Area</div><div class="metric-value" id="geomWallArea" style="font-size:18px;">${geom.wallArea.toFixed(1)} m²</div></div>
              <div class="metric-card"><div class="metric-label">Roof Area</div><div class="metric-value" id="geomRoofArea" style="font-size:18px;">${geom.roofArea.toFixed(1)} m²</div></div>
            </div>
          </div>
          <div class="card" style="margin-top:16px;" id="livePreviewCard">
            <h3>Live Prediction <span class="tag tag-model">auto-updates</span></h3>
            <div id="livePreview"><p class="subtitle">Change any parameter above to see a live prediction here.</p></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Wall, Roof, Floor Construction &amp; Insulation</h3>
        <div class="grid grid-3">
          <fieldset><legend>Wall</legend>
            <div class="form-row"><label>Material</label><select id="dWallMat">${wallOpts}</select></div>
            <div class="form-row"><label>Thickness (mm)</label><input id="dWallThick" type="number" value="${d.wall.thicknessMm}"></div>
            <div class="form-row"><label>Insulation</label><select id="dWallInsMat">${DATA.materialsByCategory("INSULATION").map(m=>`<option value="${m.id}" ${d.wall.insulationMaterialId===m.id?"selected":""}>${m.name}</option>`).join("")}</select></div>
            <div class="form-row"><label>Insulation thickness (mm)</label><input id="dWallInsThick" type="number" value="${d.wall.insulationThicknessMm}"></div>
          </fieldset>
          <fieldset><legend>Roof</legend>
            <div class="form-row"><label>Material</label><select id="dRoofMat">${roofOpts}</select></div>
            <div class="form-row"><label>Thickness (mm)</label><input id="dRoofThick" type="number" value="${d.roof.thicknessMm}"></div>
            <div class="form-row"><label>Insulation</label><select id="dRoofInsMat">${DATA.materialsByCategory("INSULATION").map(m=>`<option value="${m.id}" ${d.roof.insulationMaterialId===m.id?"selected":""}>${m.name}</option>`).join("")}</select></div>
            <div class="form-row"><label>Insulation thickness (mm)</label><input id="dRoofInsThick" type="number" value="${d.roof.insulationThicknessMm}"></div>
          </fieldset>
          <fieldset><legend>Floor &amp; Thermal Mass</legend>
            <div class="form-row"><label>Floor material</label><select id="dFloorMat">${wallOpts}</select></div>
            <div class="form-row"><label>Thermal mass material</label><select id="dMassMat">
              <option value="">None</option>
              ${DATA.materialsByCategory("THERMAL_MASS").map(m=>`<option value="${m.id}" ${d.thermalMass && d.thermalMass.materialId===m.id?"selected":""}>${m.name}</option>`).join("")}
            </select></div>
            <div class="form-row"><label>Thermal mass (kg)</label><input id="dMassKg" type="number" value="${d.thermalMass?d.thermalMass.massKg:0}"></div>
          </fieldset>
        </div>
        <button class="btn btn-accent" id="saveMaterialsBtn">Save construction</button>
        <span class="hint">U-values (wall ${ENGINE.wallUValue(d).toFixed(2)} W/m²K · roof ${ENGINE.roofUValue(d).toFixed(2)} W/m²K · floor ${ENGINE.floorUValue(d).toFixed(2)} W/m²K) are calculated live from these layers.</span>
      </div>`;

    drawShelterPreview(U.qs("#preview2d", root), d, geom);

    // 3D preview: box approximation using the shape's overall bounding
    // dimensions (geom.L / geom.W already cover this for every shape,
    // including circular/L — see the note rendered above the canvas).
    // Loaded as an ES module (see index.html's import map), which can
    // still be mid-fetch the first time this page renders — retried a
    // few times before giving up gracefully rather than blocking on it.
    function update3DView(design, g) {
      if (!currentShelter3D) return;
      const wallMatId = design.wall && design.wall.materialId;
      currentShelter3D.update({
        width: g.L, length: g.W || g.L, height: design.height || 3,
        doorCount: (design.doors || []).reduce((s, dr) => s + (dr.count || 0), 0),
        windowCount: (design.windows || []).reduce((s, w) => s + (w.count || 0), 0),
        windowFace: (design.windows && design.windows[0] && design.windows[0].orientation) || "FRONT",
        wallColor: WALL_COLOR_BY_MATERIAL[wallMatId] || "#dfeef2",
        sunAngle: ENGINE.frontAzimuthOf(design)
      });
    }
    (function tryInit3D(attemptsLeft) {
      const canvas = U.qs("#shelter3dCanvas", root);
      if (!canvas) return; // navigated away before this fired
      if (window.AreaTherm3D && window.AreaTherm3D.Shelter3D) {
        try {
          if (currentShelter3D) currentShelter3D.dispose();
          currentShelter3D = new window.AreaTherm3D.Shelter3D(canvas);
          update3DView(d, geom);
        } catch (e) {
          window.APP.logError("shelter3d-init", e);
          const status = U.qs("#shelter3dStatus", root);
          status.hidden = false; status.textContent = "3D preview failed to start.";
        }
      } else if (attemptsLeft > 0) {
        setTimeout(() => tryInit3D(attemptsLeft - 1), 300);
      } else {
        const status = U.qs("#shelter3dStatus", root);
        status.hidden = false;
        status.textContent = "3D preview unavailable — couldn't load Three.js (check your internet connection).";
      }
    })(10);

    function refreshOccupancyPreview() {
      const persons = parseInt(U.qs("#dOccupancy", root).value) || 0;
      const activityId = U.qs("#dActivity", root).value;
      const equipW = parseFloat(U.qs("#dInternal", root).value) || 0;
      const occ = ENGINE.computeOccupancyHeat({ occupancy: persons, occupancyActivity: activityId, internalHeatGainW: equipW });
      U.qs("#occupancyPreview", root).innerHTML =
        `Occupant heat: <b>${U.n(occ.totalW, 0)} W</b> total (${U.n(occ.sensibleW, 0)} W sensible, heats the air +
        ${U.n(occ.latentW, 0)} W latent, ≈${U.n(occ.latentKgPerHour, 2)} kg/h moisture, not simulated as humidity) +
        ${U.n(equipW, 0)} W equipment. A per-person fresh-air ventilation allowance is also added — see the
        Simulation page after running for the full sensible-gain-vs-ventilation-loss trade-off.`;
    }
    refreshOccupancyPreview();
    ["#dOccupancy", "#dActivity", "#dInternal"].forEach(sel => U.on(sel, "input", refreshOccupancyPreview, root));

    U.on("#dShape", "change", () => {
      const v = U.qs("#dShape", root).value;
      const isRoundV = ["CIRCULAR","DOME","SEMI_CIRCULAR"].includes(v);
      const isLShapeV = v === "L_SHAPE";
      U.qs("#rectFields", root).style.display = (isRoundV || isLShapeV) ? "none" : "";
      U.qs("#roundFields", root).style.display = isRoundV ? "" : "none";
      U.qs("#lshapeFields", root).style.display = isLShapeV ? "" : "none";
    }, root);
    U.on("#dOrientation", "change", () => {
      U.qs("#azimuthRow", root).style.display = U.qs("#dOrientation", root).value === "CUSTOM" ? "" : "none";
    }, root);

    // Reads every field on this page (geometry, orientation, openings,
    // occupancy, wall/roof/floor/mass construction) into one design object —
    // shared by both Save buttons and the live-prediction auto-recompute
    // below, so there's exactly one place that knows how to read this form.
    function readDesignFromForm() {
      const shape = U.qs("#dShape", root).value;
      const isRoundShape = ["CIRCULAR", "DOME", "SEMI_CIRCULAR"].includes(shape);
      const isLShapeShape = shape === "L_SHAPE";
      // Height lives in a different field per shape group (only one of
      // which is visible at a time) — read the one that actually matches
      // the current selection, not just whichever field happens to exist
      // first in the DOM.
      const heightFieldId = isLShapeShape ? "#dHeight3" : isRoundShape ? "#dHeight2" : "#dHeight";
      const occupancy = parseInt(U.qs("#dOccupancy", root).value) || 0;
      const occupancyActivity = U.qs("#dActivity", root).value;
      const draft = {
        ...d,
        shape,
        length: parseFloat(U.qs("#dLength", root).value) || d.length,
        width: parseFloat(U.qs("#dWidth", root).value) || d.width,
        height: parseFloat(U.qs(heightFieldId, root).value) || d.height,
        diameter: parseFloat(U.qs("#dDiameter", root) ? U.qs("#dDiameter", root).value : d.diameter) || d.diameter,
        lengthA: parseFloat(U.qs("#dLengthA", root).value) || d.lengthA || 4,
        widthA: parseFloat(U.qs("#dWidthA", root).value) || d.widthA || 4,
        lengthB: parseFloat(U.qs("#dLengthB", root).value) || d.lengthB || 3,
        widthB: parseFloat(U.qs("#dWidthB", root).value) || d.widthB || 3,
        orientation: U.qs("#dOrientation", root).value,
        azimuthDeg: parseFloat(U.qs("#dAzimuth", root).value) || 0,
        airLeakageAch: U.numOr(U.qs("#dAch", root).value, d.airLeakageAch),
        occupancy, occupancyActivity,
        internalHeatGainW: parseFloat(U.qs("#dInternal", root).value) || 0,
        windows: [{
          areaEach: parseFloat(U.qs("#dWinArea", root).value) || d.windows[0].areaEach,
          count: parseInt(U.qs("#dWinCount", root).value) || d.windows[0].count,
          orientation: U.qs("#dWinOrient", root).value, glazingMaterialId: U.qs("#dGlazing", root).value
        }],
        doors: [{ areaEach: parseFloat(U.qs("#dDoorArea", root).value) || d.doors[0].areaEach, count: 1 }],
        wall: {
          materialId: U.qs("#dWallMat", root).value,
          thicknessMm: parseFloat(U.qs("#dWallThick", root).value) || d.wall.thicknessMm,
          insulationMaterialId: U.qs("#dWallInsMat", root).value,
          insulationThicknessMm: U.numOr(U.qs("#dWallInsThick", root).value, d.wall.insulationThicknessMm)
        },
        roof: {
          materialId: U.qs("#dRoofMat", root).value,
          thicknessMm: parseFloat(U.qs("#dRoofThick", root).value) || d.roof.thicknessMm,
          insulationMaterialId: U.qs("#dRoofInsMat", root).value,
          insulationThicknessMm: U.numOr(U.qs("#dRoofInsThick", root).value, d.roof.insulationThicknessMm)
        },
        floor: { materialId: U.qs("#dFloorMat", root).value, thicknessMm: 100 }
      };
      const massMatId = U.qs("#dMassMat", root).value;
      const massKg = parseFloat(U.qs("#dMassKg", root).value) || 0;
      if (massMatId && massKg > 0) {
        let floorArea = geom.floorArea;
        try { floorArea = ENGINE.computeGeometry(draft).floorArea; } catch (e) { /* mid-edit, keep last-known geometry */ }
        draft.thermalMass = { materialId: massMatId, massKg, surfaceAreaM2: Math.min(floorArea, massKg / 300) };
      } else {
        draft.thermalMass = null;
      }
      return draft;
    }

    function renderLivePreview(el, result) {
      el.innerHTML = `
        <div class="grid grid-2">
          <div class="metric-card"><div class="metric-label">Predicted Indoor Temp</div><div class="metric-value" style="font-size:16px;">${result.comfort.minIndoor}–${result.comfort.maxIndoor}°C</div></div>
          <div class="metric-card"><div class="metric-label">Comfort Score</div><div class="metric-value" style="font-size:16px;">${result.scores.thermalComfortScore}/100</div></div>
          <div class="metric-card"><div class="metric-label">Comfort Duration</div><div class="metric-value" style="font-size:16px;">${result.comfort.comfortHoursPerDay} h/day</div></div>
          <div class="metric-card"><div class="metric-label">Net Energy</div><div class="metric-value" style="font-size:16px;">${result.daily.netKwh} kWh/day</div></div>
        </div>
        <p class="hint" style="margin-top:8px;">Updates automatically as you edit the design — visit Thermal Simulation for the full hourly breakdown.</p>`;
    }

    // Live prediction: recomputes on any field change (800ms debounce, so
    // typing doesn't trigger 60 recalcs/sec) and immediately on blur, so
    // leaving a field never leaves a stale preview. Only updates the small
    // #livePreview panel in place — never a full page re-render — so focus
    // and cursor position in whatever field you're editing are preserved.
    // This does NOT record a simulation-history entry; only the explicit
    // "Run Simulation" actions elsewhere do that.
    function liveRecompute() {
      const previewEl = U.qs("#livePreview", root);
      if (!previewEl) return;
      const draft = readDesignFromForm();

      // Geometry + 2D preview update whenever dimensions are computable,
      // independent of whether a climate is loaded or the full design
      // validates — this is what keeps "Derived Geometry" from going
      // stale while you're still typing.
      try {
        const liveGeom = ENGINE.computeGeometry(draft);
        const sane = [liveGeom.floorArea, liveGeom.volume, liveGeom.wallArea, liveGeom.roofArea]
          .every(v => Number.isFinite(v) && v > 0);
        if (sane) {
          U.qs("#geomFloorArea", root).textContent = liveGeom.floorArea.toFixed(1) + " m²";
          U.qs("#geomVolume", root).textContent = liveGeom.volume.toFixed(1) + " m³";
          U.qs("#geomWallArea", root).textContent = liveGeom.wallArea.toFixed(1) + " m²";
          U.qs("#geomRoofArea", root).textContent = liveGeom.roofArea.toFixed(1) + " m²";
          drawShelterPreview(U.qs("#preview2d", root), draft, liveGeom);
          update3DView(draft, liveGeom);
        }
      } catch (e) { /* dimensions mid-edit / not yet valid — leave last-good geometry on screen */ }

      const season = STORE.currentSeason();
      if (!season) {
        previewEl.innerHTML = `<p class="subtitle">Load a location &amp; climate to see a live prediction here.</p>`;
        return;
      }
      const check = window.APP_VALIDATOR.validateDesign({ ...STORE.get(), design: draft });
      if (!check.valid) {
        previewEl.innerHTML = `<p class="hint" style="color:var(--bad);">Fix inputs to see a live prediction — ${U.esc(check.errors[0].message)}</p>`;
        return;
      }
      STORE.updateDesign(draft);
      try {
        const result = ENGINE.runSimulation(draft, season, STORE.get().simConfig);
        renderLivePreview(previewEl, result);
      } catch (e) {
        window.APP.logError("liveRecompute", e);
        previewEl.innerHTML = `<p class="hint">Live prediction unavailable for the current inputs.</p>`;
      }
    }
    const debouncedRecompute = U.debounce(liveRecompute, 800);
    root.addEventListener("input", debouncedRecompute);
    root.addEventListener("change", debouncedRecompute);
    root.addEventListener("blur", (e) => {
      if (/^(INPUT|SELECT)$/.test(e.target.tagName)) debouncedRecompute.flush();
    }, true);
    liveRecompute();

    U.on("#saveDesignBtn", "click", () => {
      const draft = readDesignFromForm();
      const check = window.APP_VALIDATOR.validateDesign({ ...STORE.get(), design: draft });
      if (!check.valid) { alert("Please fix the following before saving:\n\n- " + check.errors.map(e => e.message).join("\n- ")); return; }
      STORE.updateDesign(draft);
      window.APP.render();
      window.APP.toast("Shelter design saved.");
    }, root);

    U.on("#saveMaterialsBtn", "click", () => {
      const draft = readDesignFromForm();
      const check = window.APP_VALIDATOR.validateDesign({ ...STORE.get(), design: draft });
      if (!check.valid) { alert("Please fix the following before saving:\n\n- " + check.errors.map(e => e.message).join("\n- ")); return; }
      STORE.updateDesign(draft);
      window.APP.render();
      window.APP.toast("Construction saved.");
    }, root);
  };

  // ---------------------------------------------------------------------
  UI.renderMaterials = function (root) {
    const cats = ["WALL", "ROOF", "INSULATION", "THERMAL_MASS", "WINDOW"];
    const tableFor = cat => {
      const rows = DATA.materialsByCategory(cat);
      const isWindow = cat === "WINDOW", isMass = cat === "THERMAL_MASS";
      return `<div class="table-wrap"><table><thead><tr>
          <th>Name</th>${isWindow ? "<th>U-value (W/m²K)</th><th>SHGC</th>" : "<th>Density (kg/m³)</th><th>k (W/mK)</th><th>Cp (J/kgK)</th>"}
          <th>Absorptivity</th><th>${isMass ? "Cost (₹/kg)" : "Cost (₹/m²)"}</th><th>Sustainability</th>
        </tr></thead><tbody>
        ${rows.map(m => `<tr>
          <td>${U.esc(m.name)}</td>
          ${isWindow ? `<td class="num">${m.uValue}</td><td class="num">${m.shgc}</td>` : `<td class="num">${m.density||"—"}</td><td class="num">${m.k||"—"}</td><td class="num">${m.cp||"—"}</td>`}
          <td class="num">${m.absorptivity ?? "—"}</td>
          <td class="num">${isMass ? (m.costPerKg??"—") : (m.costPerM2??"—")}</td>
          <td>${m.sustainability}</td>
        </tr>`).join("")}
        </tbody></table></div>`;
    };

    root.innerHTML = `
      <h1>Material Database</h1>
      <p class="subtitle"><span class="tag tag-demo">Engineering database value</span> — typical/handbook reference
      properties, editable. <b>Not</b> independently lab-tested for this project and <b>not</b> sourced from a
      CPWD or state PWD Schedule of Rates (SOR) — costs below are a rough materials + installation + waste-factor
      planning estimate only. Nothing on this page is labelled "Verified"; replace any figure with an actual SOR
      line item or vendor quotation before using it in a real costing or procurement decision.</p>
      ${cats.map(c => `<div class="card" style="margin-bottom:16px;"><h3>${c.replace("_"," ")}</h3>${tableFor(c)}</div>`).join("")}

      <div class="card">
        <h3>Add Custom Material</h3>
        <div class="form-inline">
          <div class="form-row"><label>Category</label><select id="cmCat">${cats.map(c=>`<option value="${c}">${c}</option>`).join("")}</select></div>
          <div class="form-row"><label>Name</label><input id="cmName" placeholder="e.g. Local yak-wool felt"></div>
          <div class="form-row"><label>Density (kg/m³)</label><input id="cmDensity" type="number"></div>
          <div class="form-row"><label>k (W/mK)</label><input id="cmK" type="number" step="0.001"></div>
          <div class="form-row"><label>Cp (J/kgK)</label><input id="cmCp" type="number"></div>
        </div>
        <button class="btn btn-accent btn-sm" id="addMaterialBtn">Add material</button>
        <span class="hint">Custom materials are marked <b>user-provided</b>, not pre-validated engineering values.</span>
      </div>`;

    U.on("#addMaterialBtn", "click", () => {
      const cat = U.qs("#cmCat", root).value, name = U.qs("#cmName", root).value.trim();
      if (!name) { alert("Enter a material name."); return; }
      DATA.MATERIALS.push({
        id: "custom_" + Date.now(), category: cat, name,
        density: parseFloat(U.qs("#cmDensity", root).value) || null,
        k: parseFloat(U.qs("#cmK", root).value) || null,
        cp: parseFloat(U.qs("#cmCp", root).value) || null,
        absorptivity: 0.6, reflectivity: 0.4, emissivity: 0.9,
        costPerM2: 1000, costPerKg: 5, sustainability: "MEDIUM", isCustom: true
      });
      window.APP.render();
      window.APP.toast("Custom material added (user-provided — not a validated engineering value).");
    }, root);
  };

  // =======================================================================
  // Guided Setup — a simplified 5-step wizard for non-engineers. Advanced
  // fields (shape, azimuth, per-face windows, etc.) are skipped here; use
  // Shelter Designer / Materials directly for full control.
  // =======================================================================
  const GUIDED_STEPS = ["Location", "Shelter", "Materials", "Comfort", "Run"];
  let guidedStep = 1;

  function guidedStepBar(current) {
    return `<div class="wizard-steps">${GUIDED_STEPS.map((label, i) => {
      const n = i + 1;
      const cls = n === current ? "active" : n < current ? "done" : "";
      return `<div class="wizard-step ${cls}"><span class="num">${n < current ? "✓" : n}</span>${label}</div>`;
    }).join("")}</div>`;
  }

  function guidedNav(root, canNext, nextLabel) {
    return `<div class="wizard-nav">
      <button class="btn" id="guidedBack" ${guidedStep === 1 ? "disabled" : ""}>← Back</button>
      <button class="btn btn-accent" id="guidedNext" ${canNext ? "" : "disabled"}>${nextLabel || "Next →"}</button>
    </div>`;
  }

  function wireGuidedNav(root, onNext) {
    U.on("#guidedBack", "click", () => { guidedStep = Math.max(1, guidedStep - 1); window.APP.render(); }, root);
    U.on("#guidedNext", "click", onNext, root);
  }

  UI.renderGuided = function (root) {
    const s = STORE.get();
    if (guidedStep === 1) return renderGuidedLocation(root, s);
    if (guidedStep === 2) return renderGuidedShelter(root, s);
    if (guidedStep === 3) return renderGuidedMaterials(root, s);
    if (guidedStep === 4) return renderGuidedComfort(root, s);
    return renderGuidedRun(root, s);
  };

  function renderGuidedLocation(root, s) {
    const loc = s.location;
    root.innerHTML = `
      <h1>Guided Setup</h1>
      ${guidedStepBar(1)}
      <div class="card">
        <h3>Step 1 — Select a Location</h3>
        <div class="form-row" style="max-width:420px;"><label>Reference location</label>
          <select id="gLocSelect">${locationSelectOptions(loc ? loc.key : null)}</select>
        </div>
        <button class="btn btn-accent" id="gLoadReal">🌐 Load Real Weather (Open-Meteo)</button>
        <span id="gFetchStatus" class="hint" style="margin-left:8px;"></span>
        <p class="hint" style="margin-top:10px;">Need a location that isn't in this list? Use
        <a href="#/location" style="color:var(--accent);font-weight:600;">Location &amp; Climate</a> to enter custom coordinates.</p>
        <div id="gClimateBox" style="margin-top:14px;">${loc ? U.badge(s.climateSource) : `<p class="subtitle">No climate loaded yet — click "Load Real Weather" above.</p>`}</div>
      </div>
      ${guidedNav(root, !!s.location)}`;

    U.on("#gLoadReal", "click", async () => {
      const id = U.qs("#gLocSelect", root).value;
      const btn = U.qs("#gLoadReal", root);
      btn.disabled = true;
      U.qs("#gFetchStatus", root).textContent = "Fetching live weather…";
      try {
        await STORE.loadRealClimate(id);
        window.APP.render();
      } catch (e) {
        U.qs("#gFetchStatus", root).textContent = "";
        alert("Could not fetch live weather: " + e.message + "\n\nCheck your internet connection and try again.");
        btn.disabled = false;
      }
    }, root);
    wireGuidedNav(root, () => { guidedStep = 2; window.APP.render(); });
  }

  function renderGuidedShelter(root, s) {
    const d = s.design;
    root.innerHTML = `
      <h1>Guided Setup</h1>
      ${guidedStepBar(2)}
      <div class="grid grid-2">
        <div class="card">
          <h3>Step 2 — Define Your Shelter</h3>
          <div class="form-inline">
            <div class="form-row"><label>Length (m)</label><input id="gLength" type="number" step="0.1" value="${d.length}"></div>
            <div class="form-row"><label>Width (m)</label><input id="gWidth" type="number" step="0.1" value="${d.width}"></div>
            <div class="form-row"><label>Height (m)</label><input id="gHeight" type="number" step="0.1" value="${d.height}"></div>
          </div>
          <div class="form-row"><label>Facing direction</label>
            <select id="gOrientation">${["SOUTH","EAST","NORTH","WEST"].map(v => `<option value="${v}" ${d.orientation===v?"selected":""}>${v}</option>`).join("")}</select>
          </div>
          <p class="hint">South-facing generally captures the most winter sun in the Northern Hemisphere.</p>
        </div>
        <div class="card" style="text-align:center;">
          <h3>Live Preview</h3>
          <div id="gPreview"></div>
        </div>
      </div>
      ${guidedNav(root, true)}`;

    function refreshPreview() {
      const patch = {
        length: parseFloat(U.qs("#gLength", root).value) || d.length,
        width: parseFloat(U.qs("#gWidth", root).value) || d.width,
        height: parseFloat(U.qs("#gHeight", root).value) || d.height,
        orientation: U.qs("#gOrientation", root).value, shape: "RECTANGULAR"
      };
      const previewDesign = { ...d, ...patch };
      drawShelterPreview(U.qs("#gPreview", root), previewDesign, ENGINE.computeGeometry(previewDesign));
      return patch;
    }
    refreshPreview();
    ["#gLength", "#gWidth", "#gHeight", "#gOrientation"].forEach(sel => U.on(sel, "input", refreshPreview, root));

    wireGuidedNav(root, () => {
      const patch = refreshPreview();
      const merged = { ...d, ...patch };
      const check = ENGINE.validateDesign(merged);
      if (!check.valid) { alert("Please fix the following before continuing:\n\n- " + check.errors.join("\n- ")); return; }
      STORE.updateDesign(patch);
      guidedStep = 3; window.APP.render();
    });
  }

  const MATERIAL_PRESETS = {
    wall: [
      { id: "wall_stone", label: "Local Stone (Default)", sub: "Traditional, thermal mass" },
      { id: "wall_composite", label: "Composite Insulated", sub: "Better insulation, higher cost" },
      { id: "wall_adobe", label: "Adobe", sub: "Low-cost, locally sourced" }
    ],
    roof: [
      { id: "roof_rcc", label: "RCC Slab (Default)", sub: "Standard concrete roof" },
      { id: "roof_insulated_metal", label: "Insulated Metal", sub: "Lightweight, PUF core" },
      { id: "roof_composite", label: "Composite Roof", sub: "Metal + rockwool + ply" }
    ],
    insulation: [50, 75, 100]
  };

  function renderGuidedMaterials(root, s) {
    const d = s.design;
    root.innerHTML = `
      <h1>Guided Setup</h1>
      ${guidedStepBar(3)}
      <div class="card">
        <h3>Step 3 — Choose Materials</h3>
        <h3 style="margin-top:14px;">Wall</h3>
        <div class="preset-row">${MATERIAL_PRESETS.wall.map(p => `
          <button class="preset-btn ${d.wall.materialId === p.id ? "selected" : ""}" data-wall="${p.id}">
            <span class="t">${p.label}</span><span class="s">${p.sub}</span></button>`).join("")}</div>
        <h3 style="margin-top:14px;">Roof</h3>
        <div class="preset-row">${MATERIAL_PRESETS.roof.map(p => `
          <button class="preset-btn ${d.roof.materialId === p.id ? "selected" : ""}" data-roof="${p.id}">
            <span class="t">${p.label}</span><span class="s">${p.sub}</span></button>`).join("")}</div>
        <h3 style="margin-top:14px;">Insulation Thickness</h3>
        <div class="preset-row">${MATERIAL_PRESETS.insulation.map(mm => `
          <button class="preset-btn ${d.wall.insulationThicknessMm === mm ? "selected" : ""}" data-ins="${mm}" style="min-width:90px;text-align:center;">
            <span class="t">${mm} mm</span></button>`).join("")}</div>
        <p class="hint" style="margin-top:8px;">Need a custom material or thickness? Use the full <a href="#/designer" style="color:var(--accent);font-weight:600;">Shelter Designer</a> instead.</p>
      </div>
      ${guidedNav(root, true)}`;

    U.qsa("[data-wall]", root).forEach(b => b.addEventListener("click", () => {
      STORE.updateDesign({ wall: { ...d.wall, materialId: b.dataset.wall } });
      window.APP.render();
    }));
    U.qsa("[data-roof]", root).forEach(b => b.addEventListener("click", () => {
      STORE.updateDesign({ roof: { ...d.roof, materialId: b.dataset.roof } });
      window.APP.render();
    }));
    U.qsa("[data-ins]", root).forEach(b => b.addEventListener("click", () => {
      const mm = parseInt(b.dataset.ins);
      STORE.updateDesign({
        wall: { ...d.wall, insulationMaterialId: d.wall.insulationMaterialId || "ins_puf", insulationThicknessMm: mm },
        roof: { ...d.roof, insulationMaterialId: d.roof.insulationMaterialId || "ins_puf", insulationThicknessMm: mm }
      });
      window.APP.render();
    }));
    wireGuidedNav(root, () => { guidedStep = 4; window.APP.render(); });
  }

  function renderGuidedComfort(root, s) {
    const c = s.design.comfort;
    const d = s.design;
    const baseMin = c.baseMin != null ? c.baseMin : c.min;
    const clothingId = c.clothingLevel || "TYPICAL";
    const activityId = c.activityLevel || "SEATED";
    root.innerHTML = `
      <h1>Guided Setup</h1>
      ${guidedStepBar(4)}
      <div class="card">
        <h3>Step 4 — Set Comfort Range &amp; Occupancy</h3>
        <p class="subtitle">This prototype models thermal comfort for human occupants.</p>
        <div class="form-row" style="max-width:340px;"><label>What is this shelter for?</label>
          <select id="gComfortProfile">${DATA.COMFORT_PROFILES.map(p => `<option value="${p.id}" ${c.profileId===p.id?"selected":""}>${p.label}</option>`).join("")}</select>
        </div>
        <div class="form-inline">
          <div class="form-row"><label>Min comfortable temp (°C)</label><input id="gMin" type="number" value="${baseMin}"></div>
          <div class="form-row"><label>Max comfortable temp (°C)</label><input id="gMax" type="number" value="${c.max}"></div>
        </div>
        <div class="form-inline">
          <div class="form-row"><label>Clothing level</label>
            <select id="gClothing">${DATA.CLOTHING_LEVELS.map(cl => `<option value="${cl.id}" ${clothingId === cl.id ? "selected" : ""}>${cl.label} (${cl.clo} clo)</option>`).join("")}</select>
          </div>
          <div class="form-row"><label>Activity level (comfort)</label>
            <select id="gComfortActivity">${DATA.COMFORT_ACTIVITY_LEVELS.map(a => `<option value="${a.id}" ${activityId === a.id ? "selected" : ""}>${a.label} (${a.met} met)</option>`).join("")}</select>
          </div>
        </div>
        <p class="hint">Clothing and activity shift the minimum comfortable temperature — heavier clothing or more activity means occupants stay comfortable at a lower indoor temperature.</p>
        <h3 style="margin-top:14px;">Occupancy</h3>
        <div class="form-inline">
          <div class="form-row"><label>Occupancy (persons)</label><input id="gOccupancy" type="number" min="0" max="50" value="${d.occupancy}"></div>
          <div class="form-row"><label>Activity level (heat output)</label>
            <select id="gActivity">${DATA.ACTIVITY_LEVELS.map(a => `<option value="${a.id}" ${(d.occupancyActivity||"SEATED")===a.id?"selected":""}>${a.label} (${a.watts} W/person)</option>`).join("")}</select>
          </div>
        </div>
      </div>
      ${guidedNav(root, true, "Continue to Run →")}`;

    wireGuidedNav(root, () => {
      const baseMinVal = parseFloat(U.qs("#gMin", root).value);
      const maxVal = parseFloat(U.qs("#gMax", root).value);
      if (!(baseMinVal < maxVal)) { alert("Comfort minimum must be lower than comfort maximum."); return; }
      const clothingLevel = U.qs("#gClothing", root).value;
      const activityLevel = U.qs("#gComfortActivity", root).value;
      STORE.updateDesign({
        comfort: {
          profileId: U.qs("#gComfortProfile", root).value, baseMin: baseMinVal, max: maxVal, clothingLevel, activityLevel,
          min: DATA.effectiveComfortMin(baseMinVal, clothingLevel, activityLevel, maxVal)
        },
        occupancy: parseInt(U.qs("#gOccupancy", root).value) || 0,
        occupancyActivity: U.qs("#gActivity", root).value
      });
      guidedStep = 5; window.APP.render();
    });
  }

  function renderGuidedRun(root, s) {
    const d = s.design, season = STORE.currentSeason();
    root.innerHTML = `
      <h1>Guided Setup</h1>
      ${guidedStepBar(5)}
      <div class="card">
        <h3>Step 5 — Review &amp; Run</h3>
        <div class="grid grid-3">
          <div class="metric-card"><div class="metric-label">Location</div><div class="metric-value" style="font-size:15px;">${s.location ? U.esc(s.location.label) : "—"}</div></div>
          <div class="metric-card"><div class="metric-label">Shelter</div><div class="metric-value" style="font-size:15px;">${d.length}×${d.width}×${d.height}m, ${d.orientation}</div></div>
          <div class="metric-card"><div class="metric-label">Comfort Range</div><div class="metric-value" style="font-size:15px;">${d.comfort.min}–${d.comfort.max}°C</div></div>
        </div>
        <div style="margin-top:8px;">${U.badge(s.climateSource)}</div>
        <button class="btn btn-accent" id="gRunBtn" style="margin-top:16px;font-size:14px;padding:12px 24px;" ${season ? "" : "disabled"}>▶ Run Simulation</button>
        ${!season ? `<p class="hint">Go back to Step 1 and load a climate profile first.</p>` : ""}
        <div id="gRunStatus" class="hint" style="margin-top:8px;"></div>
        <div id="gValidationErrors" hidden></div>
      </div>
      <div class="wizard-nav"><button class="btn" id="guidedBack">← Back</button><span></span></div>`;

    U.on("#guidedBack", "click", () => { guidedStep = 4; window.APP.render(); }, root);
    U.on("#gRunBtn", "click", () => {
      const check = window.APP_VALIDATOR.validateDesign(s);
      if (!check.valid) {
        U.showValidationErrors(root, "#gValidationErrors", check.errors);
        window.APP.toast("Fix the highlighted design values before running.");
        return;
      }
      U.showValidationErrors(root, "#gValidationErrors", []);
      const btn = U.qs("#gRunBtn", root);
      btn.disabled = true;
      U.qs("#gRunStatus", root).textContent = "Running thermal simulation and design optimization…";
      setTimeout(() => {
        try {
          const result = ENGINE.runSimulation(s.design, season, s.simConfig);
          STORE.recordSimulation(result);
          const opt = ENGINE.runOptimization(s.design, season, s.simConfig, s.weights);
          STORE.recordOptimization(opt);
          guidedStep = 1; // reset wizard for next time
          window.APP.navigate("evaluator");
          window.APP.toast("Simulation and optimization complete.");
        } catch (e) {
          U.qs("#gRunStatus", root).textContent = "";
          alert("Simulation failed: " + e.message);
          btn.disabled = false;
        }
      }, 30);
    }, root);
  }
})();
