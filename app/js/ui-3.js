/* AreaTherm UI — Validation, Reports, Evaluator Summary, Settings */
window.UI = window.UI || {};

(function () {
  const DATA = window.APP_DATA, ENGINE = window.APP_ENGINE, STORE = window.APP_STORE, CH = window.APP_CHARTS, CFG = window.APP_CONFIG;
  function matName(id) { const m = DATA.materialById(id); return m ? m.name : id || "—"; }

  // Steady-state point-balance approximation, kept consistent with the main
  // transient engine's conventions by calling the SAME shared helpers
  // runSimulation uses (windAdjustedInfiltrationAch, ventUAFromAch,
  // estimateGroundTempC) rather than re-deriving the ACH/UA/ground-temp
  // formulas here — occupant heat is split sensible/latent (only the
  // sensible share heats the air) and ventilation includes the same
  // wind-adjusted infiltration plus occupancy-linked ACH increment as
  // runSimulation. `season` also carries the site's real NASA POWER
  // monthly/annual climatology when the caller has it (see the
  // #runValidationBtn handler below) — without it, the floor term falls
  // back to referencing ambientC directly, same as before this existed.
  function predictSteadyState(design, ambientC, solarWm2, season) {
    const geom = ENGINE.computeGeometry(design);
    const uWall = ENGINE.wallUValue(design), uRoof = ENGINE.roofUValue(design), uFloor = ENGINE.floorUValue(design);
    // Summed across every window group, not just the first — a design can
    // have windows on more than one face, each with its own area/glazing.
    let windowArea = 0, windowCondUA = 0, windowSolarGain = 0;
    (design.windows || []).forEach(win => {
      const area = (win.areaEach || 0) * (win.count || 0);
      const shgc = (DATA.materialById(win.glazingMaterialId) || {}).shgc || 0.7;
      windowArea += area;
      windowCondUA += ENGINE.windowUValue(win) * area;
      windowSolarGain += area * solarWm2 * 0.85 * shgc;
    });
    const doorArea = (design.doors || []).reduce((s, d) => s + (d.areaEach || 0) * (d.count || 0), 0);
    // Net the window (and door) area out of the wall's own area first —
    // otherwise a window/door was double-counted: once as if that area were
    // solid wall, and again via its own separate term (doors don't get a
    // separate conduction term here at all — an existing, disclosed
    // simplification of this quick point-estimate tool — but their area
    // still isn't wall, so it has to come out of wallArea regardless).
    const netWallArea = Math.max(0, geom.wallArea - windowArea - doorArea);
    const occ = ENGINE.computeOccupancyHeat(design);
    const infiltrationAch = ENGINE.windAdjustedInfiltrationAch(design, season || { windMs: 2 });
    const achTotal = infiltrationAch + ENGINE.occupancyAchIncrement(occ.persons, geom.volume);
    const ventUA = ENGINE.ventUAFromAch(achTotal, geom.volume);
    const floorUA = uFloor * geom.floorArea;
    const UA = uWall * netWallArea + uRoof * geom.roofArea + floorUA + windowCondUA + ventUA;
    const solarGain = windowSolarGain + occ.totalSensibleW;
    // Ground temperature, same real per-location NASA POWER climatology
    // runSimulation uses (see engine.js estimateGroundTempC) — only when
    // this measured point's `season` actually carries it; otherwise the
    // floor keeps referencing ambientC exactly as before (tGround-ambientC
    // cancels to 0 below), the original disclosed simplification.
    const hasClimatology = season && (Array.isArray(season.monthlyTemp) || Number.isFinite(season.avgTempCAnnual));
    const tGround = hasClimatology ? ENGINE.estimateGroundTempC(season) : ambientC;
    return ambientC + (floorUA * (tGround - ambientC) + solarGain) / UA;
  }

  let validationRows = [
    { hour: 8, ambient: -6, solar: 120, wind: 2, rh: 35, measured: 4 },
    { hour: 12, ambient: 2, solar: 620, wind: 2.4, rh: 30, measured: 13 },
    { hour: 16, ambient: -1, solar: 240, wind: 2.1, rh: 32, measured: 9 },
    { hour: 20, ambient: -9, solar: 0, wind: 1.8, rh: 38, measured: 1 }
  ];

  // Categorized honest-status summary — the same real facts already
  // written out in Settings' "Assumptions & Limitations" card (ui-3.js,
  // UI.renderSettings), just regrouped under the model/data/materials
  // headings a reviewer would look for. No claim here that isn't already
  // stated elsewhere in the app — deliberately does NOT include invented
  // accuracy figures (e.g. a specific +/-X C error band) since this
  // prototype's accuracy against real shelters has not been measured yet.
  function modelAssumptionsHtml() {
    return `
      <div class="card" style="margin-bottom:16px;">
        <h3>Model Assumptions &amp; Reliability</h3>
        <div class="callout-error card" style="margin-bottom:14px;">
          <h3>Validation Status: Not Field-Validated</h3>
          <p style="margin:0;">Expected model accuracy has not been formally quantified against field measurements —
          no instrumented-shelter dataset exists yet. Treat results as model predictions for design comparison, not a
          substitute for engineering sign-off before construction.</p>
        </div>
        <div class="grid grid-2">
          <div>
            <h3>Physics Model</h3>
            <ul class="assumption-list">
              <li>✓ Transient (hourly RC, 2-node) model, not steady-state.</li>
              <li>✓ Accounts for solar gain, thermal mass, ground-coupled floor loss, and ventilation.</li>
              <li>✗ Not modeled: full 3D heat conduction, air stratification, moisture transport (latent heat is reported, not simulated as indoor humidity).</li>
              <li>✗ Sky longwave radiation is folded into the sol-air simplification, not a separate term.</li>
              <li>⚠ Ventilation (ACH) uses a documented per-person fresh-air allowance (${CFG.PHYSICS.OCCUPANT_FRESH_AIR_LPS} L/s/person) — an order-of-magnitude guideline, not a ventilation-code compliance calculation.</li>
            </ul>
          </div>
          <div>
            <h3>Data Sources</h3>
            <ul class="assumption-list">
              <li>✓ Open-Meteo: live 7-day hourly forecast average.</li>
              <li>✓ NASA POWER: real 20-year solar/temperature climatology.</li>
              <li>✓ Open-Meteo Elevation API: real elevation lookup.</li>
              <li>⚠ Weather is a forecast average, not a real-time or historical field measurement.</li>
              <li>⚠ A network hiccup falls back to cached data — always clearly labelled as cached or stale, never silently shown as live.</li>
            </ul>
          </div>
          <div>
            <h3>Material Properties</h3>
            <ul class="assumption-list">
              <li>✓ Sourced from engineering handbook reference values.</li>
              <li>⚠ Costs are a materials + installation + waste-factor planning estimate — not a CPWD/state PWD Schedule of Rates or vendor quotation.</li>
              <li>⚠ Thermal properties assume uniform, homogeneous materials.</li>
            </ul>
          </div>
          <div>
            <h3>Comfort &amp; Scoring</h3>
            <ul class="assumption-list">
              <li>⚠ Thermal Comfort Score is a custom, project-defined weighted index — not PMV/PPD or any recognised thermal-comfort standard.</li>
              <li>⚠ Comfort-zone colour bands (18–27°C etc.) are a simplified temperature-only proxy; real comfort also depends on humidity, air speed and clothing.</li>
            </ul>
          </div>
        </div>
        <p class="hint" style="margin-top:10px;">Full field-validated assumptions list: see Settings → Assumptions &amp; Limitations. The tool below compares the model against your own measured readings when you have them.</p>
      </div>`;
  }

  UI.renderValidation = function (root) {
    const s = STORE.get();

    root.innerHTML = `
      <h1>Model Validation</h1>
      <p class="subtitle"><span class="tag tag-field">user-provided</span> Enter measured field data (from an actual
      instrumented shelter) to compare against the model's prediction. No field measurements exist for this prototype —
      the rows below are editable placeholders you can overwrite. Requires field validation before use in a real
      engineering decision.</p>

      ${modelAssumptionsHtml()}

      <div class="card">
        <h3>Measured Data Points</h3>
        <div class="table-wrap"><table><thead><tr>
          <th>Hour of day</th><th>Ambient (°C)</th><th>Solar (W/m²)</th><th>Wind (m/s)</th><th>RH (%)</th><th>Measured Indoor (°C)</th><th></th>
        </tr></thead><tbody id="valRows">
          ${validationRows.map((r, i) => `<tr data-i="${i}">
            <td><input type="number" step="0.5" value="${r.hour}" data-f="hour" style="width:70px;"></td>
            <td><input type="number" value="${r.ambient}" data-f="ambient" style="width:70px;"></td>
            <td><input type="number" value="${r.solar}" data-f="solar" style="width:80px;"></td>
            <td><input type="number" step="0.1" value="${r.wind}" data-f="wind" style="width:60px;"></td>
            <td><input type="number" value="${r.rh}" data-f="rh" style="width:60px;"></td>
            <td><input type="number" step="0.1" value="${r.measured}" data-f="measured" style="width:70px;"></td>
            <td><button class="btn btn-sm" data-remove="${i}">✕</button></td>
          </tr>`).join("")}
        </tbody></table></div>
        <button class="btn btn-sm" id="addRowBtn" style="margin-top:8px;">+ Add row</button>
        <button class="btn btn-accent" id="runValidationBtn" style="margin-left:8px;">Compare Measured vs Predicted</button>
        <p class="hint">Predicted values use a steady-state point-balance approximation (Q_solar + Q_occupant,sensible = UA × ΔT)
        against the current shelter design — a simplification for point-in-time validation, documented as an assumption.
        Full transient validation requires continuous time-aligned field logging (future integration).</p>
      </div>

      <div id="validationResults"></div>
    `;

    function bindRows() {
      U.qsa("#valRows input", root).forEach(inp => inp.addEventListener("change", () => {
        const i = parseInt(inp.closest("tr").dataset.i);
        validationRows[i][inp.dataset.f] = parseFloat(inp.value);
      }));
      U.qsa("[data-remove]", root).forEach(btn => btn.addEventListener("click", () => {
        validationRows.splice(parseInt(btn.dataset.remove), 1);
        window.APP.render();
      }));
    }
    bindRows();

    U.on("#addRowBtn", "click", () => {
      validationRows.push({ hour: 12, ambient: 0, solar: 300, wind: 2, rh: 30, measured: 10 });
      window.APP.render();
    }, root);

    U.on("#runValidationBtn", "click", () => {
      // Each measured row supplies its own ambient/solar/wind, but not a
      // ground temperature — pull the currently-loaded site's real NASA
      // POWER climatology (if any) as the best available ground-temp
      // context, same source runSimulation itself uses. If this validation
      // dataset was actually recorded somewhere else, that's an inherent
      // limit of a location-less measured-row format, not new from this.
      const liveSeason = STORE.currentSeason();
      const points = validationRows.map(r => ({
        ...r, predicted: Math.round(predictSteadyState(s.design, r.ambient, r.solar, {
          windMs: r.wind,
          avgTempCAnnual: liveSeason && liveSeason.avgTempCAnnual,
          monthlyTemp: liveSeason && liveSeason.monthlyTemp
        }) * 100) / 100
      }));
      const stats = ENGINE.validationStats(points.map(p => ({ measured: p.measured, predicted: p.predicted })));
      STORE.addValidationDataset({ id: "VAL-" + Date.now(), ts: new Date().toISOString(), points, stats });

      const wrap = U.qs("#validationResults", root);
      wrap.innerHTML = `
        <div class="card" style="margin-top:16px;">
          <h3>Error Metrics <span class="tag tag-model">model prediction vs user-provided measurement</span></h3>
          <div class="grid grid-4">
            <div class="metric-card card"><div class="metric-label">MAE</div><div class="metric-value">${stats.mae}</div><div class="metric-sub">°C</div></div>
            <div class="metric-card card"><div class="metric-label">RMSE</div><div class="metric-value">${stats.rmse}</div><div class="metric-sub">°C</div></div>
            <div class="metric-card card"><div class="metric-label">MAPE</div><div class="metric-value">${stats.mape}</div><div class="metric-sub">%</div></div>
            <div class="metric-card card"><div class="metric-label">R²</div><div class="metric-value">${stats.r2 ?? "—"}</div><div class="metric-sub">n = ${stats.n}</div></div>
          </div>
          <h3 style="margin-top:14px;">Measured vs Predicted</h3>
          <div id="valScatter" style="max-width:440px;"></div>
          <button class="btn btn-sm" id="exportValCsvBtn" style="margin-top:10px;">⬇ Export rows to CSV</button>
        </div>`;
      CH.scatterChart(U.qs("#valScatter", wrap), points.map(p => ({ x: p.measured, y: p.predicted })), { xLabel: "Measured Indoor (°C)", yLabel: "Predicted Indoor (°C)" });
      U.on("#exportValCsvBtn", "click", () => {
        const headers = ["Hour", "Ambient (C)", "Solar (W/m2)", "Wind (m/s)", "RH (%)", "Measured Indoor (C)", "Predicted Indoor (C)"];
        const rows = points.map(p => [p.hour, p.ambient, p.solar, p.wind, p.rh, p.measured, p.predicted]);
        window.APP_EXPORT.downloadCsv("areatherm_validation_data.csv", headers, rows);
      }, wrap);
    }, root);
  };

  // ---------------------------------------------------------------------
  UI.renderReport = function (root) {
    const s = STORE.get();
    const result = s.lastSimulationResult;
    const opt = s.lastOptimizationResult;
    const season = STORE.currentSeason();
    const now = new Date();
    const simId = "SIM-" + now.getTime();
    const geom = ENGINE.computeGeometry(s.design);
    // design.length/width only hold real dimensions for a rectangular
    // footprint — see U.shapeDimensionsText for why every shape needs its
    // own case, shared across every screen that displays this.
    const shapeDimensions = U.shapeDimensionsText(s.design);

    root.innerHTML = `
      <div class="card" style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div><b>Engineering Report</b> — printable / exportable to PDF via your browser's print dialog (works fully offline, no external library required).</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn" id="climateCardBtn">📄 Climate Profile Card</button>
          <button class="btn" id="materialCompBtn">📄 Material Comparison Sheet</button>
          <button class="btn btn-sm" id="exportMaterialsBtn">⬇ Material Sheet (CSV)</button>
          <button class="btn btn-accent" id="printBtn">🖨 Print / Save as PDF</button>
        </div>
      </div>
      <div class="card" id="reportDoc" style="line-height:1.7;">
        <h1 style="text-align:center;">Area-Specific Passive Shelter Thermal Performance &amp; Design Optimization Report</h1>
        <p style="text-align:center;color:var(--text-muted);">Generated: ${now.toLocaleString()} &nbsp;|&nbsp; Model version: ${CFG.MODEL_VERSION} &nbsp;|&nbsp; Simulation ID: ${simId}</p>
        <hr/>
        <div class="card callout-warn">
          <h3>Important Disclaimer</h3>
          <p style="margin:0;">This report contains model-based predictions. Field validation against instrumented
          shelter measurements is <b>required</b> before deployment.<br/>
          Data source: <b>${s.climateSource ? U.esc(s.climateSource.label) : "Not set"}</b>
          ${s.climateSource ? `(${U.esc(s.climateSource.period || "live")})` : ""}<br/>
          Validation status: <b>${s.validationDatasets.length ? s.validationDatasets.length + " dataset(s) compared — see Validation module" : "Not field-validated"}</b></p>
        </div>
        <h3 style="margin-top:16px;">1–2. Project &amp; Location</h3>
        <p>Project: <b>${U.esc(s.project.name)}</b><br/>
        Location: <b>${s.location ? U.esc(s.location.label) : "Not set"}</b>
        ${s.location ? `(Lat ${s.location.latitude.toFixed(3)}, Lon ${s.location.longitude.toFixed(3)}, Elevation ${s.location.elevationM ?? "—"} m${s.location.elevationSource ? " — " + U.esc(s.location.elevationSource.label) : ""})` : ""}
        ${s.climateSource ? `<span class="tag tag-demo">${U.esc(s.climateSource.label)}</span>` : ""}</p>

        <h3>3. Climate Inputs (${s.seasonKey || "—"})</h3>
        ${season ? `<p>Ambient temperature: ${season.tMin} to ${season.tMax} °C · Solar irradiance: ${season.solarKwhDay} kWh/m²/day ·
        Sunshine window: ${season.sunrise}h–${season.sunset}h · Wind: ${season.windMs} m/s · RH: ${season.rhPct}% · Cloud cover: ${season.cloudPct}%
        ${season.precipMmDayAvg != null ? " · Precipitation: " + season.precipMmDayAvg + " mm/day" : ""}</p>` : "<p>—</p>"}

        <h3>4. Shelter Geometry</h3>
        <p>Shape: ${s.design.shape} · Orientation: ${s.design.orientation}${s.design.orientation==="CUSTOM"?" ("+s.design.azimuthDeg+"° from South)":""} ·
        Dimensions: ${shapeDimensions} · Floor area: ${geom.floorArea.toFixed(1)} m² · Volume: ${geom.volume.toFixed(1)} m³</p>

        <h3>5–6. Material Specification &amp; Thermal Properties</h3>
        <table><tr><th>Element</th><th>Material</th><th>Thickness</th><th>U-value (W/m²K)</th></tr>
          <tr><td>Wall</td><td>${matName(s.design.wall.materialId)} + ${matName(s.design.wall.insulationMaterialId)}</td><td>${s.design.wall.thicknessMm}mm + ${s.design.wall.insulationThicknessMm}mm</td><td>${ENGINE.wallUValue(s.design).toFixed(3)}</td></tr>
          <tr><td>Roof</td><td>${matName(s.design.roof.materialId)} + ${matName(s.design.roof.insulationMaterialId)}</td><td>${s.design.roof.thicknessMm}mm + ${s.design.roof.insulationThicknessMm}mm</td><td>${ENGINE.roofUValue(s.design).toFixed(3)}</td></tr>
          <tr><td>Floor</td><td>${matName(s.design.floor.materialId)}</td><td>${s.design.floor.thicknessMm}mm</td><td>${ENGINE.floorUValue(s.design).toFixed(3)}</td></tr>
          ${s.design.windows.map((w, i) => `<tr><td>Window${s.design.windows.length > 1 ? " " + (i + 1) + " (" + w.orientation + ")" : ""}</td><td>${matName(w.glazingMaterialId)}</td><td>${w.count}×${w.areaEach}m²</td><td>${ENGINE.windowUValue(w).toFixed(2)}</td></tr>`).join("")}
          <tr><td>Thermal mass</td><td>${s.design.thermalMass ? matName(s.design.thermalMass.materialId)+" ("+s.design.thermalMass.massKg+" kg)" : "None"}</td><td>—</td><td>—</td></tr>
        </table>
        <p class="hint">Material costs are a rough materials + installation + waste-factor planning estimate — not
        sourced from a CPWD/state PWD Schedule of Rates. Use the CSV export above for a full properties sheet.</p>

        <h3>7. Simulation Methodology</h3>
        <p>Two-node RC (indoor air + thermal mass) hourly energy-balance model. Solar gain via sol-air temperature
        (opaque surfaces) and SHGC-based transmission (glazing). Occupant heat is split into sensible (heats the
        indoor-air node) and latent (reported as an illustrative moisture-generation figure only) shares by activity
        level, and ventilation (ACH) includes a documented per-person fresh-air allowance on top of wind-adjusted
        infiltration — see ARCHITECTURE.md SS3 for full formulas. Time step: ${s.simConfig.timeStepMinutes} min · Period: ${s.simConfig.periodType}.</p>

        <h3>8. Assumptions</h3>
        <ul>
          <li>Outside film coefficient: fixed at 23 W/m²K for the wall/roof U-value's design resistance (a static
          assembly property); the hourly sol-air temperature term instead uses a wind-adjusted ASHRAE correlation
          (5.8 + 3.9 × wind speed) driven by the site's real per-hour wind data. Wind-adjusted infiltration.</li>
          <li>Ground temperature uses the site's real NASA POWER 20-year monthly climatology (one-month thermal lag)
          when that data has loaded for the current location; falls back to the current forecast period's mean
          ambient temperature otherwise — user-overridable.</li>
          <li>Longwave sky radiation exchange not separately modelled (folded into sol-air simplification).</li>
          <li>PCM thermal mass modelled via elevated apparent specific heat over its melt band.</li>
          <li>Occupant sensible/latent split uses simplified fixed fractions per activity level (see Settings), approximating
          the general trend in ASHRAE Fundamentals Ch. 9 / ISO 8996 — not a literal reproduction of their exact tables.</li>
          <li>Occupancy-linked ventilation uses a documented per-person fresh-air allowance (order-of-magnitude guideline,
          not a specific ventilation-code compliance calculation).</li>
        </ul>

        ${result ? `
        <h3>9–11. Solar Energy, Heat Transfer &amp; Indoor Temperature Prediction <span class="tag tag-model">Model Prediction</span></h3>
        <table>
          <tr><td>Solar heat gain</td><td class="num">${result.daily.solarKwh} kWh/day</td></tr>
          <tr><td>Wall / roof / floor / opening / ventilation loss</td><td class="num">${result.daily.wallLossKwh} / ${result.daily.roofLossKwh} / ${result.daily.floorLossKwh} / ${result.daily.openingLossKwh} / ${result.daily.ventLossKwh} kWh/day</td></tr>
          <tr><td>&nbsp;&nbsp;↳ of which occupancy-linked ventilation</td><td class="num">${result.daily.occupancyVentLossKwh} kWh/day</td></tr>
          <tr><td>Net energy balance</td><td class="num">${result.daily.netKwh} kWh/day</td></tr>
          <tr><td>Predicted indoor temperature range</td><td class="num">${result.comfort.minIndoor} – ${result.comfort.maxIndoor} °C</td></tr>
        </table>
        <h3>12. Thermal Comfort Analysis</h3>
        <p>Comfort duration: ${result.comfort.comfortHoursPerDay} h/day (day ${result.comfort.dayComfortPct}%, night ${result.comfort.nightComfortPct}%).
        Thermal Comfort Score: <b>${result.scores.thermalComfortScore}/100</b> — a custom, project-defined index (see Settings), not PMV/PPD.
        ${result.occupancy.persons > 0 && result.occupancy.note ? `<br/>Occupancy note: ${U.esc(result.occupancy.note)}` : ""}</p>` : `<p><i>No simulation has been run yet for this report.</i></p>`}

        ${opt ? `
        <h3>13–15. Candidate Comparison, Optimization Results &amp; Recommended Design</h3>
        <p>${opt.candidatesEvaluated} candidate configurations evaluated. Recommended: <b>Design ${opt.recommended.label}</b> —
        ${opt.recommended.params.orient}-facing, ${matName(opt.recommended.design.wall.materialId)} wall,
        ${opt.recommended.params.insul}mm insulation, ${matName(opt.recommended.params.glz)} glazing at
        ${Math.round(opt.recommended.params.wpct*100)}% window area. Thermal score ${opt.recommended.score.total.toFixed(0)}/100,
        estimated cost ₹${opt.recommended.cost.toLocaleString("en-IN")} (materials-only planning estimate).</p>
        <h3>16. Sensitivity Analysis</h3>
        <p>See Optimization module for the ranked parameter-impact chart on this design.</p>` : `<p><i>No optimization run yet for this report.</i></p>`}

        <h3>17. Limitations</h3>
        <p>Climate inputs used here are ${s.climateSource ? s.climateSource.label.toLowerCase() : "user-provided"}, not
        field-measured. The thermal model is a simplified two-node transient RC network — it omits 3D conduction,
        detailed longwave radiation exchange, and moisture transport (occupant latent heat is reported, not simulated
        as indoor humidity). Results are model predictions requiring engineering and field validation before
        construction decisions. Expected accuracy has not been formally quantified against field data — no
        instrumented-shelter dataset exists yet for this project (see Validation module).</p>

        <h3>18. Engineering Validation Requirements</h3>
        <p>Before construction: (1) validate material properties against actual procured specifications and replace
        the planning-estimate costs with a CPWD/PWD Schedule of Rates line item or vendor quotation; (2) instrument
        a pilot shelter and compare against the Validation module; (3) have a qualified structural/thermal engineer
        review the final design.</p>
      </div>`;

    U.on("#printBtn", "click", () => window.print(), root);
    U.on("#climateCardBtn", "click", () => window.APP.navigate("climate-card"), root);
    U.on("#materialCompBtn", "click", () => window.APP.navigate("material-comparison"), root);
    U.on("#exportMaterialsBtn", "click", () => {
      const d = s.design;
      const rows = [];
      const pushMat = (element, matId, thicknessMm) => {
        const m = DATA.materialById(matId);
        if (!m) return;
        rows.push([element, m.name, thicknessMm ?? "", m.density ?? "", m.k ?? "", m.cp ?? "", m.uValue ?? "", m.shgc ?? "", m.costPerM2 ?? m.costPerKg ?? "", m.sustainability ?? ""]);
      };
      pushMat("Wall", d.wall.materialId, d.wall.thicknessMm + "mm");
      pushMat("Wall insulation", d.wall.insulationMaterialId, d.wall.insulationThicknessMm + "mm");
      pushMat("Roof", d.roof.materialId, d.roof.thicknessMm + "mm");
      pushMat("Roof insulation", d.roof.insulationMaterialId, d.roof.insulationThicknessMm + "mm");
      pushMat("Floor", d.floor.materialId, d.floor.thicknessMm + "mm");
      d.windows.forEach((w, i) => pushMat(`Window glazing${d.windows.length > 1 ? " " + (i + 1) + " (" + w.orientation + ")" : ""}`, w.glazingMaterialId, `${w.count}×${w.areaEach}m²`));
      if (d.thermalMass) pushMat("Thermal mass", d.thermalMass.materialId, d.thermalMass.massKg + "kg");
      const headers = ["Element", "Material", "Thickness/Qty", "Density (kg/m3)", "k (W/mK)", "Cp (J/kgK)", "U-value (W/m2K)", "SHGC", "Cost (INR/m2 or /kg)", "Sustainability"];
      window.APP_EXPORT.downloadCsv("areatherm_material_sheet.csv", headers, rows);
      window.APP.toast("Material comparison sheet exported.");
    }, root);
  };

  // ---------------------------------------------------------------------
  // Standalone one-page Climate Profile — same browser print-to-PDF
  // pattern as the main report, so no new dependency is needed.
  UI.renderClimateCard = function (root) {
    const s = STORE.get();
    const loc = s.location;
    const season = STORE.currentSeason();
    if (!loc || !season) {
      root.innerHTML = `<h1>Climate Profile Card</h1><div class="card"><p class="subtitle">No climate profile loaded yet. Go to <a href="#/location" style="color:var(--accent);font-weight:600;">Location &amp; Climate</a> and load a location first.</p></div>`;
      return;
    }
    const zone = U.classifyClimate(loc, season);
    const recs = U.climateRecommendations(loc, season);
    const sd = loc.solarDataSource;

    root.innerHTML = `
      <div class="card" style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
        <div><b>Climate Profile Card</b> — one-page printable summary for ${U.esc(loc.label)}.</div>
        <div style="display:flex; gap:8px;">
          <button class="btn" id="ccBackBtn">← Back to Reports</button>
          <button class="btn btn-accent" id="ccPrintBtn">🖨 Print / Save as PDF</button>
        </div>
      </div>
      <div class="card" id="climateCardDoc" style="line-height:1.7;">
        <h1 style="text-align:center;">Climate Profile — ${U.esc(loc.label)}</h1>
        <p style="text-align:center;color:var(--text-muted);">Generated: ${new Date().toLocaleString()} · Data: ${sd ? "NASA POWER + Open-Meteo (live)" : "Open-Meteo (live)"}</p>
        <hr/>
        <table>
          <tr><td>Location</td><td class="num">${U.esc(loc.label)} (${U.esc(loc.state)})</td></tr>
          <tr><td>Coordinates</td><td class="num">${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)}</td></tr>
          <tr><td>Elevation</td><td class="num">${loc.elevationM != null ? loc.elevationM + " m" : "—"}</td></tr>
          <tr><td>Climate zone</td><td class="num">${U.esc(zone || "—")}</td></tr>
        </table>

        <h3 style="margin-top:16px;">Temperature &amp; Solar</h3>
        <table>
          <tr><td>Ambient temperature (loaded season)</td><td class="num">${season.tMin} to ${season.tMax} °C</td></tr>
          <tr><td>Solar irradiance (loaded season)</td><td class="num">${season.solarKwhDay} kWh/m²/day</td></tr>
          ${loc.annualSolarKwhM2Yr ? `<tr><td>Annual solar potential</td><td class="num">${loc.annualSolarKwhM2Yr} kWh/m²/yr${sd ? " (NASA POWER, " + U.esc(sd.period) + ")" : " (extrapolated)"}</td></tr>` : ""}
          ${sd && sd.monthlyTemp ? (() => {
            const hottest = sd.monthlyTemp.reduce((a, b) => (b.tempC > a.tempC ? b : a));
            const coldest = sd.monthlyTemp.reduce((a, b) => (b.tempC < a.tempC ? b : a));
            const sunniest = sd.monthlyGhi.reduce((a, b) => (b.kwhM2Day > a.kwhM2Day ? b : a));
            return `<tr><td>Hottest / coldest month</td><td class="num">${hottest.month} (${hottest.tempC.toFixed(1)}°C) / ${coldest.month} (${coldest.tempC.toFixed(1)}°C)</td></tr>
                    <tr><td>Best month for solar heating</td><td class="num">${sunniest.month} (${sunniest.kwhM2Day.toFixed(2)} kWh/m²/day)</td></tr>`;
          })() : ""}
        </table>

        <h3 style="margin-top:16px;">Humidity, Wind &amp; Season Notes</h3>
        <p>Relative humidity: <b>${season.rhPct}%</b> · Wind: <b>${season.windMs} m/s</b> · Cloud cover: <b>${season.cloudPct}%</b>.
        ${season.rhPct > 70 ? "High humidity — ventilation and moisture management matter more than sealing here." : "Humidity is moderate — not a primary design driver."}</p>

        ${sd && sd.monthlyTemp ? `<h3 style="margin-top:16px;">Monthly Temperature</h3><div id="ccMonthlyTemp"></div>` : ""}

        <h3 style="margin-top:16px;">Design Implications Summary</h3>
        <ul>${recs.map(r => `<li><b>${U.esc(r.text)}</b> — ${U.esc(r.reason)}</li>`).join("") || "<li>No strong climate driver identified — balanced design suits this location.</li>"}</ul>
      </div>`;

    if (sd && sd.monthlyTemp) {
      CH.monthlyBarChart(U.qs("#ccMonthlyTemp", root),
        sd.monthlyTemp.map(m => ({ label: m.month, mean: m.tempC, min: m.tempMinC, max: m.tempMaxC })),
        { height: 200, yLabel: "°C" });
    }
    U.on("#ccPrintBtn", "click", () => window.print(), root);
    U.on("#ccBackBtn", "click", () => window.APP.navigate("reports"), root);
  };

  // ---------------------------------------------------------------------
  // Standalone one-page Material Comparison sheet for the currently
  // selected design's materials, plus a CSV export (no library needed —
  // a plain Blob download).
  UI.renderMaterialComparison = function (root) {
    const s = STORE.get();
    const d = s.design;
    const rows = [
      { role: "Wall", mat: DATA.materialById(d.wall.materialId), thicknessMm: d.wall.thicknessMm },
      { role: "Wall insulation", mat: DATA.materialById(d.wall.insulationMaterialId), thicknessMm: d.wall.insulationThicknessMm },
      { role: "Roof", mat: DATA.materialById(d.roof.materialId), thicknessMm: d.roof.thicknessMm },
      { role: "Roof insulation", mat: DATA.materialById(d.roof.insulationMaterialId), thicknessMm: d.roof.insulationThicknessMm },
      { role: "Floor", mat: DATA.materialById(d.floor.materialId), thicknessMm: d.floor.thicknessMm },
      ...d.windows.map((w, i) => ({ role: `Glazing${d.windows.length > 1 ? " " + (i + 1) + " (" + w.orientation + ")" : ""}`, mat: DATA.materialById(w.glazingMaterialId), thicknessMm: null })),
      { role: "Thermal mass", mat: d.thermalMass ? DATA.materialById(d.thermalMass.materialId) : null, thicknessMm: null }
    ].filter(r => r.mat);

    root.innerHTML = `
      <div class="card" style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div><b>Material Comparison Sheet</b> — the materials currently selected for <b>${U.esc(s.project.name)}</b>.</div>
        <div style="display:flex; gap:8px;">
          <button class="btn" id="mcBackBtn">← Back to Reports</button>
          <button class="btn" id="mcExportBtn">⬇ Export CSV</button>
          <button class="btn btn-accent" id="mcPrintBtn">🖨 Print / Save as PDF</button>
        </div>
      </div>
      <div class="card" id="materialCompDoc" style="line-height:1.7;">
        <h1 style="text-align:center;">Material Comparison — ${U.esc(s.project.name)}</h1>
        <p style="text-align:center;color:var(--text-muted);">Generated: ${new Date().toLocaleString()}</p>
        <hr/>
        <table>
          <tr><th>Role</th><th>Material</th><th>Thickness</th><th>Property Values</th><th>Cost</th><th>Sustainability</th></tr>
          ${rows.map(r => `<tr>
            <td>${r.role}</td>
            <td>${U.esc(r.mat.name)}${r.mat.isCustom ? ' <span class="tag tag-field">user-provided</span>' : ""}</td>
            <td class="num">${r.thicknessMm != null ? r.thicknessMm + " mm" : "—"}</td>
            <td class="num">${r.mat.uValue != null ? "U=" + r.mat.uValue + ", SHGC=" + r.mat.shgc : (r.mat.k != null ? "k=" + r.mat.k + " W/mK, ρ=" + (r.mat.density ?? "—") + " kg/m³" : "—")}</td>
            <td class="num">${r.mat.costPerKg != null && r.role === "Thermal mass" ? "₹" + r.mat.costPerKg + "/kg" : (r.mat.costPerM2 != null ? "₹" + r.mat.costPerM2 + "/m²" : "—")}</td>
            <td>${U.esc(r.mat.sustainability || "—")}</td>
          </tr>`).join("")}
        </table>
        <p class="hint" style="margin-top:10px;">Cost and property values are engineering database reference figures — verify against actual procurement before construction. Values marked "user-provided" are custom materials added via the Materials page, not pre-validated.</p>
      </div>`;

    U.on("#mcPrintBtn", "click", () => window.print(), root);
    U.on("#mcBackBtn", "click", () => window.APP.navigate("reports"), root);
    U.on("#mcExportBtn", "click", () => {
      const header = ["Role", "Material", "Thickness (mm)", "Property Values", "Cost", "Sustainability"];
      const csvRows = rows.map(r => [
        r.role, r.mat.name, r.thicknessMm ?? "",
        r.mat.uValue != null ? `U=${r.mat.uValue}, SHGC=${r.mat.shgc}` : (r.mat.k != null ? `k=${r.mat.k} W/mK` : ""),
        r.mat.costPerKg != null && r.role === "Thermal mass" ? `${r.mat.costPerKg}/kg` : (r.mat.costPerM2 != null ? `${r.mat.costPerM2}/m2` : ""),
        r.mat.sustainability || ""
      ]);
      const csv = [header].concat(csvRows).map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "material-comparison.csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, root);
  };

  // ---------------------------------------------------------------------
  UI.renderEvaluator = function (root) {
    const s = STORE.get();
    const result = s.lastSimulationResult;
    const opt = s.lastOptimizationResult;
    const weakest = opt ? (opt.all && opt.all.length ? opt.all[opt.all.length - 1] : opt.top[opt.top.length - 1]) : null;

    root.innerHTML = `
      <h1>Design Intelligence Summary</h1>
      <p class="subtitle">A 2–3 minute overview for an evaluator: the problem, the model, and the recommended design.</p>
      ${s.climateSource ? `<div style="margin-bottom:14px;">${U.badge(s.climateSource)}</div>` : ""}

      <div class="grid grid-3" style="margin-bottom:16px;">
        <div class="card"><h3>Location</h3><div style="font-size:16px;font-weight:700;">${s.location ? U.esc(s.location.label) : "Not selected"}</div>
          <div class="hint">${s.location ? (s.location.solarDataSource
            ? `${s.location.annualSolarKwhM2Yr} kWh/m²/yr (NASA POWER, ${U.esc(s.location.solarDataSource.period)}) · ${s.location.avgSunshineHoursDay}h daylight`
            : (s.climateSource && s.climateSource.type !== "STALE_CACHED"
              ? `${STORE.currentSeason().solarKwhDay} kWh/m²/day · ${s.location.avgSunshineHoursDay}h daylight · ${STORE.currentSeason().cloudPct}% cloud cover (live avg, not annual climatology)`
              : `${s.location.annualSolarKwhM2Yr} kWh/m²/yr · ${s.location.avgSunshineHoursDay}h sunshine/day · ${s.location.avgCloudFreeDays} clear days/yr`)) : ""}</div></div>
        <div class="card"><h3>Climate Severity (${s.seasonKey || "—"})</h3><div style="font-size:16px;font-weight:700;">${STORE.currentSeason() ? STORE.currentSeason().tMin + "°C to " + STORE.currentSeason().tMax + "°C" : "—"}</div>
          <div class="hint">${STORE.currentSeason() ? (STORE.currentSeason().tMax - STORE.currentSeason().tMin).toFixed(0) + "°C diurnal swing" : ""}</div></div>
        <div class="card"><h3>Validation Status</h3><div style="font-size:16px;font-weight:700;">${s.validationDatasets.length ? s.validationDatasets.length + " dataset(s) compared" : "Not yet validated"}</div>
          <div class="hint">Field validation required before deployment</div></div>
      </div>

      ${result ? `
      <div class="grid grid-2" style="margin-bottom:16px;">
        <div class="card">
          <h3>Thermal Comfort Score</h3>
          <div style="display:flex; align-items:center; gap:20px;">
            <div id="evalGauge"></div>
            <div>
              <div>Solar utilization: <b>${result.scores.solarUtilizationPct}%</b></div>
              <div>Heat retention: <b>${result.scores.heatRetentionPct}%</b></div>
              <div>Heat loss: <b>${result.daily.totalLossKwh} kWh/day</b></div>
              <div>${opt && weakest ? `Optimization improvement: <b>+${(opt.recommended.score.total - weakest.score.total).toFixed(1)} pts</b> vs weakest of all ${opt.candidatesEvaluated} evaluated candidates` : ""}</div>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Why This Design?</h3>
          <ul class="checklist">
            <li>High solar gain utilization (${result.scores.solarUtilizationPct}%)</li>
            <li>Reduced night-time heat loss via insulation (U-wall ${result.uValues.wall.toFixed(2)} W/m²K)</li>
            <li>Improved insulation on wall and roof</li>
            <li>Optimized opening area for the local solar/heat-loss trade-off</li>
            <li>${s.design.thermalMass ? "Thermal mass added for night-time heat release" : "Thermal mass not yet configured — see What-If Analysis"}</li>
            <li>Orientation set to ${s.design.orientation} for solar exposure</li>
            ${result.occupancy.persons > 0 ? `<li>Ventilation sized for ${result.occupancy.persons} occupant(s) at ${U.esc(result.occupancy.activityLabel)}</li>` : ""}
          </ul>
        </div>
      </div>
      <div class="card"><h3>Recommended Shelter</h3>
        <p>${opt ? `Design ${opt.recommended.label} — ${opt.recommended.params.orient}-facing, ${matName(opt.recommended.design.wall.materialId)} wall
        with ${opt.recommended.params.insul}mm insulation, ${matName(opt.recommended.params.glz)} glazing, thermal score
        <b>${opt.recommended.score.total.toFixed(0)}/100</b>.` : "Run Optimization to generate a recommended configuration."}</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
          <button class="btn btn-accent btn-sm" id="viewDetailedBtn">View Detailed Analysis</button>
          <button class="btn btn-sm" id="compareDesignsBtn">Compare Designs</button>
          <button class="btn btn-sm" id="generateReportBtn">Generate Report</button>
        </div>
      </div>
      ` : `<div class="card"><p class="subtitle">Run a simulation (and optimization) to populate this summary.</p></div>`}
    `;
    if (result) CH.scoreGauge(U.qs("#evalGauge", root), result.scores.thermalComfortScore);
    U.on("#viewDetailedBtn", "click", () => window.APP.navigate("simulation"), root);
    U.on("#compareDesignsBtn", "click", () => window.APP.navigate("optimization"), root);
    U.on("#generateReportBtn", "click", () => window.APP.navigate("reports"), root);
  };

  // ---------------------------------------------------------------------
  // Origin storage usage across everything (IndexedDB + localStorage) —
  // navigator.storage.estimate() is async, so this reads a cached value and
  // kicks off (at most once per empty state) a fetch that triggers one
  // re-render when it resolves, rather than blocking or polling on it.
  let storageEstimate = null; // null | "loading" | "unsupported" | {usageKB, quotaKB}
  function loadStorageEstimateOnce() {
    if (storageEstimate !== null) return;
    if (!(navigator.storage && navigator.storage.estimate)) { storageEstimate = "unsupported"; return; }
    storageEstimate = "loading";
    navigator.storage.estimate().then(est => {
      storageEstimate = { usageKB: Math.round((est.usage || 0) / 1024), quotaKB: Math.round((est.quota || 0) / 1024) };
      window.APP.render();
    }).catch(() => { storageEstimate = "unsupported"; });
  }
  function storageUsageLabel() {
    if (storageEstimate === "loading" || storageEstimate === null) return "calculating…";
    if (storageEstimate === "unsupported") return "unavailable in this browser";
    const { usageKB, quotaKB } = storageEstimate;
    return `${usageKB.toLocaleString()} KB used${quotaKB ? ` of ~${Math.round(quotaKB / 1024).toLocaleString()} MB available` : ""}`;
  }

  UI.renderSettings = function (root) {
    const s = STORE.get();
    const projects = STORE.listProjects();
    loadStorageEstimateOnce();
    root.innerHTML = `
      <h1>Settings</h1>
      <div class="grid grid-2">
        <div class="card">
          <h3>Mode</h3>
          <p>Simple Mode hides advanced engineering fields. Advanced Mode exposes full parameter control.
          Toggle in the sidebar.</p>
          <h3 style="margin-top:16px;">Appearance</h3>
          <div class="form-inline">
            <div class="form-row" style="min-width:auto;">
              <label>Theme</label>
              <div class="mode-toggle" style="background:var(--bg); border:1px solid var(--border); max-width:220px;">
                <button class="mode-btn ${s.theme !== "DARK" ? "active" : ""}" id="themeLight">☀ Light</button>
                <button class="mode-btn ${s.theme === "DARK" ? "active" : ""}" id="themeDark">☾ Dark</button>
              </div>
            </div>
          </div>
          <h3 style="margin-top:16px;">Units</h3>
          <div class="form-inline">
            <div class="form-row" style="min-width:auto;">
              <div class="mode-toggle" style="background:var(--bg); border:1px solid var(--border); max-width:220px;">
                <button class="mode-btn ${s.units !== "IMPERIAL" ? "active" : ""}" id="unitsMetricBtn" style="color:${s.units !== "IMPERIAL" ? "#fff" : "var(--text)"};">Metric</button>
                <button class="mode-btn ${s.units === "IMPERIAL" ? "active" : ""}" id="unitsImperialBtn" style="color:${s.units === "IMPERIAL" ? "#fff" : "var(--text)"};">Imperial</button>
              </div>
            </div>
          </div>
          <ul class="assumption-list">
            ${Object.entries(s.units === "IMPERIAL" ? CFG.UNITS_IMPERIAL : CFG.UNITS).map(([k,v]) => `<li>${k}: <b>${v}</b></li>`).join("")}
          </ul>
          <p class="hint">The simulation engine always computes in metric internally; this list and the figures below are converted for display only. Full unit conversion across every chart and table on other pages is not yet wired up — treat this as the reference conversion, not a site-wide switch yet.</p>
        </div>
        <div class="card">
          <h3>Assumptions &amp; Limitations</h3>
          <ul class="assumption-list">
            <li>Transient (hourly RC) model, not steady-state.</li>
            <li>Outside film coefficient: fixed at 23 W/m²K for the wall/roof U-value's design resistance (a static
            assembly property); the hourly sol-air temperature term instead uses a wind-adjusted ASHRAE correlation
            (5.8 + 3.9 × wind speed) driven by real per-hour wind data. Wind-adjusted infiltration.</li>
            <li>Sky longwave radiation folded into the sol-air simplification (no separate term).</li>
            <li>Ground temperature uses the site's real NASA POWER 20-year monthly climatology (one-month thermal
            lag) when loaded for the current location; falls back to the current forecast period's mean ambient
            temperature otherwise — user-overridable.</li>
            <li>Occupant heat uses fixed watt figures per activity level (ASHRAE Fundamentals Ch. 9 / ISO 8996 order
            of magnitude) split into sensible/latent by simplified fixed fractions — not a literal reproduction of
            those references' exact tables. Latent heat is reported (kg/h moisture), not simulated as indoor humidity.</li>
            <li>Ventilation (ACH) = wind-adjusted infiltration + a documented per-person fresh-air allowance
            (${CFG.PHYSICS.OCCUPANT_FRESH_AIR_LPS} L/s/person) — an order-of-magnitude guideline, not a specific
            ventilation-code compliance calculation.</li>
            <li>PCM modelled via elevated apparent specific heat over its melt band.</li>
            <li>Weather is a live 7-day forecast average (Open-Meteo) with real 20-year solar/temperature climatology
            (NASA POWER) and real elevation (Open-Meteo Elevation API) — a forecast/climatology blend, never a field
            measurement. A network hiccup falls back to cached data, clearly labelled as cached or stale — never
            silently shown as live.</li>
            <li>Thermal Comfort Score is a custom, project-defined weighted index — not PMV/PPD or any other
            recognised thermal-comfort standard. Comfort-zone colour bands (18–27°C etc.) are a simplified
            temperature-only proxy; real comfort also depends on humidity, air speed, and clothing.</li>
            <li>Material costs are a materials + installation + waste-factor planning estimate — not sourced from a
            CPWD/state PWD Schedule of Rates or a vendor quotation.</li>
            <li>Expected model accuracy has not been formally quantified against field measurements — no
            instrumented-shelter dataset exists yet. Field validation is identified as future work (see Validation).</li>
          </ul>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Reliability Layer</h3>
        <p class="hint" style="margin-bottom:8px;">Every external API call (Open-Meteo, NASA POWER, elevation) goes through a shared reliability layer so a slow or unreachable network degrades gracefully instead of freezing the UI:</p>
        <ul class="assumption-list">
          <li>Request timeout: ${(CFG.RELIABILITY.TIMEOUT_MS/1000).toFixed(0)}s per attempt.</li>
          <li>Retry: up to ${CFG.RELIABILITY.MAX_RETRIES} retries with exponential backoff.</li>
          <li>Circuit breaker: after ${CFG.RELIABILITY.CIRCUIT_BREAKER_FAILURE_THRESHOLD} consecutive failures, a source is skipped for ${(CFG.RELIABILITY.CIRCUIT_BREAKER_COOLDOWN_MS/1000).toFixed(0)}s rather than retried immediately.</li>
          <li>Fallback chain: live fetch → fresh cache → stale cache → a clear error message. The data-source badge always reflects which tier actually served the number.</li>
          <li>Every simulation input is validated (positive dimensions/thickness, valid comfort range, valid coordinates) before it reaches the physics solver, with a specific on-screen message instead of a crash.</li>
        </ul>
        <p class="hint" style="margin-top:10px;">Cached weather/NASA POWER/elevation lookups are kept indefinitely as an offline fallback and are never deleted automatically — after enough different locations this can add up, which is why it's stored in IndexedDB (hundreds of MB to low-GB of headroom) rather than the much smaller localStorage. Browser storage used: <b>${storageUsageLabel()}</b>.</p>
        <button class="btn btn-sm" id="clearCacheBtn">Clear cached location data</button>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Data Source Transparency</h3>
        <div class="table-wrap"><table>
          <tr><th>Metric</th><th>Source</th></tr>
          <tr><td>Hourly ambient temperature, solar irradiance, wind, humidity, cloud cover, precipitation</td><td>Real data — Open-Meteo (live 7-day forecast average; cache/stale-cache fallback honestly labelled)</td></tr>
          <tr><td>Annual solar potential, 20-yr climatology, monthly solar/temperature</td><td>Real data — NASA POWER (2001–2020 climatology)</td></tr>
          <tr><td>Elevation</td><td>Real data — Open-Meteo Elevation API (SRTM-derived)</td></tr>
          <tr><td>Indoor temperature, heat flows, comfort score, solar utilization, heat retention</td><td>Model prediction — this app's RC thermal engine</td></tr>
          <tr><td>Recommended design, candidate scores, sensitivity impacts</td><td>Model prediction — this app's optimizer</td></tr>
          <tr><td>Material thermal / cost / sustainability properties</td><td>Engineering database reference values — editable, not lab-tested, not CPWD/PWD SOR-sourced</td></tr>
          <tr><td>Validation error metrics (MAE/RMSE/MAPE/R²)</td><td>Real math, run against user-provided measurements (placeholder rows until field data exists)</td></tr>
        </table></div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Project</h3>
        <div class="form-row"><label>Project name</label><input id="projNameInput" value="${U.esc(s.project.name)}"></div>
        <button class="btn btn-sm" id="saveProjNameBtn">Save name</button>
        <button class="btn btn-sm" id="resetProjectBtn" style="margin-left:8px;color:var(--bad);">Reset project (clears all data)</button>
      </div>
      <div class="card" style="margin-top:16px;">
        <h3>Saved Projects</h3>
        <p class="subtitle">Keep more than one named design and switch between them — the current one auto-saves into its own slot as you work.</p>
        <div class="form-inline">
          <div class="form-row" style="flex:2;"><label>New project name</label><input id="newProjName" placeholder="e.g. Kargil winter shelter"></div>
          <div class="form-row" style="align-self:flex-end;"><button class="btn btn-accent btn-sm" id="newProjectBtn">＋ New Project</button></div>
        </div>
        ${projects.length ? `<div class="table-wrap"><table>
          <tr><th>Name</th><th>Last saved</th><th></th></tr>
          ${projects.map(p => `<tr class="${p.isCurrent ? "highlight-recommended" : ""}">
            <td>${U.esc(p.name)}${p.isCurrent ? ' <span class="tag tag-input">current</span>' : ""}</td>
            <td class="num">${new Date(p.updatedAt).toLocaleString()}</td>
            <td style="text-align:right;">
              ${!p.isCurrent ? `<button class="btn btn-sm" data-load-proj="${p.id}">Load</button>` : ""}
              <button class="btn btn-sm" style="color:var(--bad);margin-left:6px;" data-delete-proj="${p.id}">Delete</button>
            </td>
          </tr>`).join("")}
        </table></div>` : `<p class="hint">No saved projects yet — click "New Project" or save the current one below to start a list.</p>`}
        <button class="btn btn-sm" id="saveCurrentAsProjectBtn" style="margin-top:10px;">Save current design to this list</button>
      </div>
    `;
    U.on("#themeLight", "click", () => { STORE.setTheme("LIGHT"); window.APP.applyTheme(); window.APP.render(); }, root);
    U.on("#themeDark", "click", () => { STORE.setTheme("DARK"); window.APP.applyTheme(); window.APP.render(); }, root);
    U.on("#unitsMetricBtn", "click", () => { s.units = "METRIC"; STORE.save(); window.APP.render(); }, root);
    U.on("#unitsImperialBtn", "click", () => { s.units = "IMPERIAL"; STORE.save(); window.APP.render(); }, root);
    U.on("#saveProjNameBtn", "click", () => { s.project.name = U.qs("#projNameInput", root).value; STORE.save(); window.APP.render(); }, root);
    U.on("#clearCacheBtn", "click", async () => {
      const freed = await STORE.clearCache();
      storageEstimate = null; // force a fresh usage readout to reflect the clear
      window.APP.toast(freed ? `Cleared ${freed} cached location lookup${freed === 1 ? "" : "s"} — the next simulation will re-fetch live data as needed.` : "No cached location data to clear.");
      window.APP.render();
    }, root);
    U.on("#resetProjectBtn", "click", () => {
      if (confirm("This clears all simulations, designs, and validation data in this browser session. Continue?")) {
        STORE.reset(); window.APP.render();
      }
    }, root);
    U.on("#newProjectBtn", "click", async () => {
      const name = U.qs("#newProjName", root).value.trim();
      if (!name) { alert("Enter a name for the new project."); return; }
      await STORE.newProject(name);
      window.APP.render();
      window.APP.toast(`New project "${name}" created and set as current.`);
    }, root);
    U.on("#saveCurrentAsProjectBtn", "click", async () => {
      await STORE.saveAsProject(s.project.name);
      window.APP.render();
      window.APP.toast(`"${s.project.name}" saved to your projects list.`);
    }, root);
    U.qsa("[data-load-proj]", root).forEach(btn => btn.addEventListener("click", async () => {
      const id = btn.dataset.loadProj;
      const proj = projects.find(p => p.id === id);
      if (proj && !confirm(`Switch to "${proj.name}"? Your current design is already saved and won't be lost.`)) return;
      await STORE.loadProject(id);
      window.APP.applyTheme();
      window.APP.render();
      window.APP.toast(`Loaded "${proj ? proj.name : "project"}".`);
    }));
    U.qsa("[data-delete-proj]", root).forEach(btn => btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteProj;
      const proj = projects.find(p => p.id === id);
      if (!confirm(`Delete the saved project "${proj ? proj.name : ""}"? This only removes it from your saved list — it won't affect your current work.`)) return;
      await STORE.deleteProject(id);
      window.APP.render();
      window.APP.toast("Project deleted.");
    }));
  };
})();
