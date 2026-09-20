/* AreaTherm UI — Thermal Simulation, Optimization, What-If Analysis */
window.UI = window.UI || {};

(function () {
  const DATA = window.APP_DATA, ENGINE = window.APP_ENGINE, STORE = window.APP_STORE, CH = window.APP_CHARTS;

  function matName(id) { const m = DATA.materialById(id); return m ? m.name : id || "—"; }

  function noClimateCard() {
    return `<div class="card"><p class="subtitle">No climate profile loaded yet. Go to <a href="#/location" style="color:var(--accent);font-weight:600;">Location &amp; Climate</a> and load a location first.</p></div>`;
  }

  // Buckets a (possibly multi-day, sub-hourly) simulation series into 24
  // hour-of-day averages for the stacked heat-flow chart — sign flipped so
  // "loss" components read as negative bars (the engine's own convention is
  // "positive Q = heat leaving the shelter").
  function buildHourlyBuckets(series) {
    const buckets = Array.from({ length: 24 }, () => ({ solar: [], internal: [], wall: [], roof: [], floor: [], opening: [], vent: [], mass: [] }));
    series.forEach(s => {
      const h = Math.floor(((s.hourDecimal % 24) + 24) % 24);
      buckets[h].solar.push(s.qSolarWindow);
      buckets[h].internal.push(s.qInternal);
      buckets[h].wall.push(-s.qWall);
      buckets[h].roof.push(-s.qRoof);
      buckets[h].floor.push(-s.qFloor);
      buckets[h].opening.push(-(s.qWindowCond + s.qDoorCond));
      buckets[h].vent.push(-s.qVent);
      buckets[h].mass.push(-s.qMassExchange);
    });
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return buckets.map((b, h) => ({
      hour: h, solar: avg(b.solar), internal: avg(b.internal), wall: avg(b.wall), roof: avg(b.roof),
      floor: avg(b.floor), opening: avg(b.opening), vent: avg(b.vent), mass: avg(b.mass)
    }));
  }

  // ---- Explain Calculation content builders --------------------------
  function explainWall(result, design, season) {
    const geom = result.geometry, u = result.uValues.wall;
    const coldest = result.series.reduce((a, b) => a.tAmb < b.tAmb ? a : b);
    const face = geom.faces[0];
    return `
      <p><b>Formula</b> (per face, sol-air adjusted):</p>
      <pre>Q_wall = U_wall × A_wall × (T_indoor − T_sol-air)
T_sol-air = T_amb + (α × G_face) / h_o</pre>
      <p><b>Representative hour</b> — coldest ambient timestep in this run (hour ${coldest.hourDecimal.toFixed(1)}):</p>
      <pre>U_wall        = ${u.toFixed(3)} W/m²K   (from wall + insulation layers, see Materials)
Total wall area = ${geom.wallArea.toFixed(1)} m²
T_amb         = ${coldest.tAmb} °C
T_indoor      = ${coldest.tIndoor} °C
G (horizontal)= ${coldest.gHoriz} W/m²
α (wall)      = ${(DATA.materialById(design.wall.materialId)||{}).absorptivity ?? 0.6}
h_o           = 23 W/m²K

T_sol-air (front face, factor ${face.factor.toFixed(2)}) = ${coldest.tAmb} + (${(DATA.materialById(design.wall.materialId)||{}).absorptivity ?? 0.6} × ${(coldest.gHoriz*face.factor).toFixed(1)}) / 23
            ≈ ${(coldest.tAmb + ((DATA.materialById(design.wall.materialId)||{}).absorptivity ?? 0.6) * coldest.gHoriz*face.factor / 23).toFixed(2)} °C

Q_wall (all faces, this hour) = ${coldest.qWall} W</pre>
      <p class="hint">Positive Q = heat leaving the shelter through the walls at this timestep.</p>`;
  }
  function explainRoof(result, design) {
    const geom = result.geometry, u = result.uValues.roof;
    const coldest = result.series.reduce((a, b) => a.tAmb < b.tAmb ? a : b);
    return `<pre>Q_roof = U_roof × A_roof × (T_indoor − T_sol-air,roof)

U_roof = ${u.toFixed(3)} W/m²K
A_roof = ${geom.roofArea.toFixed(1)} m²
T_indoor = ${coldest.tIndoor} °C,  T_amb = ${coldest.tAmb} °C,  G = ${coldest.gHoriz} W/m²

Q_roof (this hour) = ${coldest.qRoof} W</pre>`;
  }
  function explainFloor(result, design) {
    const geom = result.geometry, u = result.uValues.floor;
    const coldest = result.series.reduce((a, b) => a.tAmb < b.tAmb ? a : b);
    return `<pre>Q_floor = U_floor × A_floor × (T_indoor − T_ground)

U_floor = ${u.toFixed(3)} W/m²K  (assumption: ground contact resistance 0.5 m²K/W + floor layer)
A_floor = ${geom.floorArea.toFixed(1)} m²
T_indoor = ${coldest.tIndoor} °C

Q_floor (this hour) = ${coldest.qFloor} W</pre>`;
  }
  function explainSolar(result, design) {
    const peakSun = result.series.reduce((a, b) => a.gHoriz > b.gHoriz ? a : b);
    const w = design.windows[0];
    const shgc = (DATA.materialById(w.glazingMaterialId) || {}).shgc || 0.7;
    return `<pre>Q_solar,window = A_window × G × orientation_factor × SHGC

A_window (total) = ${result.windowArea.toFixed(2)} m²
G (peak-sun hour, ${peakSun.hourDecimal.toFixed(1)}h) = ${peakSun.gHoriz} W/m²
orientation_factor (front face) = ${result.geometry.faces[0].factor.toFixed(2)}
SHGC (${matNameLocal(w.glazingMaterialId)}) = ${shgc}

Q_solar,window ≈ ${result.windowArea.toFixed(2)} × ${peakSun.gHoriz} × ${result.geometry.faces[0].factor.toFixed(2)} × ${shgc}
            = ${peakSun.qSolarWindow} W  (at this hour)

Daily total (integrated over all daylight hours) = ${result.daily.solarKwh} kWh/day</pre>
      <p class="hint">Opaque-surface solar gain (through walls/roof) is folded into the sol-air conduction terms — see Explain Calculation on Wall/Roof Loss.</p>`;
  }
  function matNameLocal(id) { const m = DATA.materialById(id); return m ? m.name : id; }

  function explainOpening(result, design) {
    const coldest = result.series.reduce((a, b) => a.tAmb < b.tAmb ? a : b);
    const peakSun = result.series.reduce((a, b) => a.gHoriz > b.gHoriz ? a : b);
    const w = design.windows[0];
    return `<pre>Conduction:  Q_window,cond = U_window × A_window × (T_indoor − T_amb)
Solar gain:  Q_solar,window = A_window × G × orientation_factor × SHGC

U_window = ${ENGINE.windowUValue(w).toFixed(2)} W/m²K,  SHGC = ${(DATA.materialById(w.glazingMaterialId)||{}).shgc}
A_window (total) = ${result.windowArea.toFixed(2)} m²

At coldest hour: T_indoor=${coldest.tIndoor}°C, T_amb=${coldest.tAmb}°C → Q_window,cond ≈ ${coldest.qWindowCond} W
At peak-sun hour (${peakSun.hourDecimal.toFixed(1)}h): G=${peakSun.gHoriz} W/m² → Q_solar,window ≈ ${peakSun.qSolarWindow} W</pre>`;
  }
  function explainVent(result, design) {
    const coldest = result.series.reduce((a, b) => a.tAmb < b.tAmb ? a : b);
    return `<pre>Q_vent = ACH_total × Volume / 3600 × ρ_air × Cp_air × (T_indoor − T_amb)
ACH_total = ACH_infiltration (wind-adjusted) + ACH_occupancy (per-person fresh-air allowance)

ACH_infiltration ≈ ${result.ach.infiltration},  ACH_occupancy ≈ ${result.ach.occupancy},  ACH_total ≈ ${result.ach.total}
Volume = ${result.geometry.volume.toFixed(1)} m³
ρ_air = 1.2 kg/m³,  Cp_air = 1005 J/kgK
T_indoor=${coldest.tIndoor}°C, T_amb=${coldest.tAmb}°C

Q_vent (this hour) = ${coldest.qVent} W</pre>
      <p class="hint">${result.occupancy.persons > 0 ? "Occupancy-linked ventilation loss: " + result.daily.occupancyVentLossKwh + " kWh/day — see Occupancy Diagnostics below." : "No occupants configured — ACH is infiltration-only."}</p>`;
  }
  function explainMass(result, design) {
    if (!design.thermalMass) return `<p>No thermal mass configured in this design.</p>`;
    const peakSun = result.series.reduce((a, b) => a.gHoriz > b.gHoriz ? a : b);
    const mat = DATA.materialById(design.thermalMass.materialId);
    return `<pre>Q_exchange = h_mass × A_mass × (T_indoor − T_mass)
C_mass × dT_mass/dt = Q_exchange + f_solar_to_mass × Q_solar,window

Material: ${mat.name},  mass = ${design.thermalMass.massKg} kg,  Cp = ${mat.cp} J/kgK
h_mass = 8 W/m²K,  A_mass = ${design.thermalMass.surfaceAreaM2} m²

At hour ${peakSun.hourDecimal.toFixed(1)} (peak solar): T_indoor=${peakSun.tIndoor}°C, T_mass=${peakSun.tMass}°C
Q_exchange ≈ ${peakSun.qMassExchange} W  (positive = mass absorbing heat from air)</pre>`;
  }
  function explainScore(result) {
    return `<pre>Thermal Comfort Score = 0.45×ComfortHours% + 0.25×HeatRetention% + 0.20×SolarUtilization% + 0.10×EnergyAdequacy

ComfortHours%   = 0.5×Daytime(${result.comfort.dayComfortPct}%) + 0.5×Night(${result.comfort.nightComfortPct}%) = ${result.scores.comfortScore}%
HeatRetention%  = ${result.scores.heatRetentionPct}%
SolarUtilization% = ${result.scores.solarUtilizationPct}%

Thermal Comfort Score = ${result.scores.thermalComfortScore} / 100</pre>
      <p class="hint">Weights are configurable in Settings / Optimization. This is a custom, project-defined index —
      not PMV/PPD or any other recognised thermal-comfort standard.</p>`;
  }

  function explainBtn(label, fn) {
    return `<span class="explain-link" data-explain="${label}">Explain calculation →</span>`;
  }

  function wireExplainButtons(root, result, design, season) {
    const map = {
      solar: () => explainSolar(result, design),
      wall: () => explainWall(result, design, season), roof: () => explainRoof(result, design),
      floor: () => explainFloor(result, design), opening: () => explainOpening(result, design),
      vent: () => explainVent(result, design), mass: () => explainMass(result, design),
      score: () => explainScore(result)
    };
    U.qsa("[data-explain]", root).forEach(elm => {
      elm.addEventListener("click", () => window.APP.showExplain(elm.textContent.replace(" →", "") + " — " + elm.dataset.explain, map[elm.dataset.explain]()));
    });
  }

  // ---------------------------------------------------------------------
  UI.renderSimulation = function (root) {
    const s = STORE.get();
    const season = STORE.currentSeason();
    if (!season) { root.innerHTML = `<h1>Thermal Simulation</h1>` + noClimateCard(); return; }

    const result = s.lastSimulationResult;
    root.innerHTML = `
      <h1>Thermal Simulation</h1>
      <p class="subtitle">Hourly physics-based energy balance for <b>${U.esc(s.location.label)}</b> — ${U.esc(s.seasonKey)}</p>
      <div style="margin-bottom:14px;">${U.badge(s.climateSource)}</div>
      <div class="card">
        <div class="form-inline">
          <div class="form-row"><label>Time step</label>
            <select id="simStep">${[15,30,60].map(v=>`<option value="${v}" ${s.simConfig.timeStepMinutes===v?"selected":""}>${v} min</option>`).join("")}</select>
          </div>
          <div class="form-row"><label>Period</label>
            <select id="simPeriod">
              <option value="24H" ${s.simConfig.periodType==="24H"?"selected":""}>24 hours</option>
              <option value="7D" ${s.simConfig.periodType==="7D"?"selected":""}>7 days</option>
              <option value="30D" ${s.simConfig.periodType==="30D"?"selected":""}>30 days</option>
            </select>
          </div>
          <div class="form-row" style="align-self:flex-end;"><button class="btn btn-accent" id="runSimBtn">▶ Run Thermal Simulation</button></div>
        </div>
        <div id="simValidationErrors" hidden></div>
      </div>

      ${result ? `
      <div class="grid grid-4" style="margin:16px 0;">
        <div class="metric-card card"><div class="metric-label">Predicted Indoor Temp</div><div class="metric-value" style="font-size:18px;">${result.comfort.minIndoor} – ${result.comfort.maxIndoor} °C</div><div class="metric-sub">Model Prediction</div></div>
        <div class="metric-card card"><div class="metric-label">Solar Heat Gain</div><div class="metric-value" style="font-size:18px;">${result.daily.solarKwh} kWh/day</div></div>
        <div class="metric-card card"><div class="metric-label">Total Heat Loss</div><div class="metric-value" style="font-size:18px;">${result.daily.totalLossKwh} kWh/day</div></div>
        <div class="metric-card card"><div class="metric-label">Comfort Duration</div><div class="metric-value" style="font-size:18px;">${result.comfort.comfortHoursPerDay} h/day</div></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h3>Indoor vs Ambient Temperature vs Comfort Range</h3>
        <div id="tempChart"></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h3>Hourly Heat Flow Breakdown <span class="tag tag-model">model prediction — first 24h</span></h3>
        <p class="hint" style="margin-bottom:8px;">Gains stack upward, losses stack downward — hover for exact watts per component.</p>
        <div id="hourlyHeatFlowDiv"></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h3>Hourly Heat Flow (stacked) <span class="tag tag-model">W, representative day, incl. thermal mass</span></h3>
        <p class="hint">Every component of the energy balance, hour by hour — bars above zero are gains, below zero are losses.</p>
        <div id="stackedHeatFlow"></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3>Heat Flow Analysis (daily totals)</h3>
          <p class="hint">Gains stack left of center, losses stack right — same scale on both sides.</p>
          <div id="heatFlowDiv"></div>
        </div>
        <div class="card">
          <h3>Heat Balance Detail <span class="tag tag-model">model prediction</span></h3>
          <table>
            <tr><td>Solar thermal energy received</td><td class="num">${result.daily.solarKwh} kWh/day</td><td>${explainBtn("solar")}</td></tr>
            <tr><td>Heat loss — walls</td><td class="num">${result.daily.wallLossKwh} kWh/day</td><td>${explainBtn("wall")}</td></tr>
            <tr><td>Heat loss — roof</td><td class="num">${result.daily.roofLossKwh} kWh/day</td><td>${explainBtn("roof")}</td></tr>
            <tr><td>Heat loss — floor</td><td class="num">${result.daily.floorLossKwh} kWh/day</td><td>${explainBtn("floor")}</td></tr>
            <tr><td>Heat loss — openings</td><td class="num">${result.daily.openingLossKwh} kWh/day</td><td>${explainBtn("opening")}</td></tr>
            <tr><td>Ventilation / infiltration loss (total)</td><td class="num">${result.daily.ventLossKwh} kWh/day</td><td>${explainBtn("vent")}</td></tr>
            <tr><td>&nbsp;&nbsp;↳ of which occupancy-linked</td><td class="num">${result.daily.occupancyVentLossKwh} kWh/day</td><td></td></tr>
            <tr><td>Thermal mass exchange</td><td class="num">${result.daily.massExchangeKwh} kWh/day</td><td>${explainBtn("mass")}</td></tr>
            <tr><td>Heating requirement</td><td class="num">${result.daily.heatingReqKwh} kWh/day</td><td></td></tr>
            <tr><td>Cooling requirement</td><td class="num">${result.daily.coolingReqKwh} kWh/day</td><td></td></tr>
            <tr style="font-weight:700;"><td>Net energy balance</td><td class="num">${result.daily.netKwh} kWh/day</td><td></td></tr>
          </table>
        </div>
      </div>

      ${result.occupancy.persons > 0 ? `
      <div class="card" style="margin-top:16px;">
        <h3>Occupancy Heat &amp; Ventilation Diagnostics</h3>
        <div class="grid grid-4">
          <div class="metric-card"><div class="metric-label">Occupants</div><div class="metric-value" style="font-size:18px;">${result.occupancy.persons}</div><div class="metric-sub">${U.esc(result.occupancy.activityLabel)}</div></div>
          <div class="metric-card"><div class="metric-label">Gross Sensible Heat Added</div><div class="metric-value" style="font-size:18px;">+${result.occupancy.sensibleKwhPerDay}</div><div class="metric-sub">kWh/day (occupant share only)</div></div>
          <div class="metric-card"><div class="metric-label">Extra Ventilation Loss</div><div class="metric-value" style="font-size:18px;">−${result.occupancy.occupancyVentLossKwhPerDay}</div><div class="metric-sub">kWh/day (occupancy-linked ACH)</div></div>
          <div class="metric-card"><div class="metric-label">Net Occupancy Effect</div><div class="metric-value" style="font-size:18px;">${result.occupancy.netOccupancyEffectKwh >= 0 ? "+" : ""}${result.occupancy.netOccupancyEffectKwh}</div><div class="metric-sub">kWh/day</div></div>
        </div>
        ${result.occupancy.note ? `<p class="hint" style="margin-top:8px;"><b>Note:</b> ${U.esc(result.occupancy.note)}</p>` : ""}
        <p class="hint">Latent heat (moisture) from occupants: ${result.occupancy.latentW} W ≈ ${result.occupancy.latentKgPerHour} kg/h — reported for context only; this model has no humidity/psychrometric state, so moisture is not simulated as an indoor RH change.</p>
      </div>` : ""}

      <div class="card" style="margin-top:16px;">
        <h3>Thermal Comfort Score ${explainBtn("score")}</h3>
        <div style="display:flex; align-items:center; gap:22px;">
          <div id="simGauge"></div>
          <ul class="checklist">
            <li>Daytime comfort: <b>${result.comfort.dayComfortPct}%</b></li>
            <li>Night comfort: <b>${result.comfort.nightComfortPct}%</b></li>
            <li>Solar utilization: <b>${result.scores.solarUtilizationPct}%</b></li>
            <li>Heat retention: <b>${result.scores.heatRetentionPct}%</b></li>
          </ul>
        </div>
      </div>
      ` : `<div class="card"><p class="subtitle">Run the simulation to see predicted indoor temperature, solar gain, heat losses, and comfort duration.</p></div>`}
    `;

    if (result) {
      const dt = s.simConfig.timeStepMinutes / 60;
      CH.lineChart(U.qs("#tempChart", root), [
        { name: "Indoor Temp", color: "#1f8a9e", data: result.series.map(pt => ({ x: pt.stepIndex * dt, y: pt.tIndoor })) },
        { name: "Ambient Temp", color: "#c93b3b", data: result.series.map(pt => ({ x: pt.stepIndex * dt, y: pt.tAmb })) }
      ], { height: 260, yLabel: "°C", xLabel: "Hours from simulation start", comfortBand: { min: s.design.comfort.min, max: s.design.comfort.max }, tempZones: true });
      const stepsPerDay = Math.round(24 * 60 / s.simConfig.timeStepMinutes);
      CH.hourlyHeatFlowChart(U.qs("#hourlyHeatFlowDiv", root), result.series.slice(0, stepsPerDay), { height: 280, yLabel: "W", xLabel: "Hour of day" });
      CH.stackedHourlyChart(U.qs("#stackedHeatFlow", root), buildHourlyBuckets(result.series), { yLabel: "W" });
      CH.stackedHeatBalanceChart(U.qs("#heatFlowDiv", root), result.daily);
      CH.scoreGauge(U.qs("#simGauge", root), result.scores.thermalComfortScore);
      wireExplainButtons(root, result, s.design, season);
    }

    U.on("#runSimBtn", "click", () => {
      const check = window.APP_VALIDATOR.validateDesign(STORE.get());
      if (!check.valid) {
        U.showValidationErrors(root, "#simValidationErrors", check.errors);
        window.APP.toast("Fix the highlighted design values before running.");
        return;
      }
      U.showValidationErrors(root, "#simValidationErrors", []);
      const timeStepMinutes = parseInt(U.qs("#simStep", root).value);
      const periodType = U.qs("#simPeriod", root).value;
      const days = periodType === "24H" ? 1 : periodType === "7D" ? 7 : 30;
      STORE.get().simConfig = { timeStepMinutes, periodType, days };
      try {
        const res = ENGINE.runSimulation(STORE.get().design, season, STORE.get().simConfig);
        STORE.recordSimulation(res);
        window.APP.render();
        window.APP.toast("Simulation complete.");
      } catch (e) {
        alert("Simulation failed: " + e.message);
      }
    }, root);
  };

  // ---------------------------------------------------------------------
  function candidateFieldValue(c, key) {
    switch (key) {
      case "rank": return c.rank;
      case "orient": return c.params.orient;
      case "insul": return c.params.insul;
      case "wpct": return c.params.wpct;
      case "glz": return matName(c.params.glz);
      case "mass": return c.params.mass;
      case "comfort": return c.score.comfort;
      case "retention": return c.score.retention;
      case "solar": return c.score.solar;
      case "energyScore": return c.score.energyScore;
      case "costScore": return c.score.costScore;
      case "cost": return c.cost;
      case "total": return c.score.total;
      default: return 0;
    }
  }

  function renderAllCandidatesRows(root, opt, sortKey, sortDir) {
    const tbody = U.qs("#allCandidatesBody", root);
    if (!tbody) return;
    const sorted = [...opt.all].sort((a, b) => {
      const va = candidateFieldValue(a, sortKey), vb = candidateFieldValue(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb) : (va - vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    tbody.innerHTML = sorted.map(c => `<tr class="${c.rank === 1 ? "highlight-recommended" : ""}">
      <td class="num">${c.rank}${c.rank === 1 ? " ★" : ""}</td><td>${c.params.orient}</td><td>${c.params.insul} mm</td>
      <td class="num">${Math.round(c.params.wpct * 100)}%</td><td>${matName(c.params.glz)}</td><td class="num">${c.params.mass} kg</td>
      <td class="num">${c.score.comfort.toFixed(0)}</td><td class="num">${c.score.retention.toFixed(0)}</td>
      <td class="num">${c.score.solar.toFixed(0)}</td><td class="num">${c.score.energyScore.toFixed(0)}</td>
      <td class="num">${c.score.costScore.toFixed(0)}</td><td class="num">${c.cost.toLocaleString("en-IN")}</td>
      <td class="num"><b>${c.score.total.toFixed(1)}</b></td>
    </tr>`).join("");
  }

  UI.renderOptimization = function (root) {
    const s = STORE.get();
    const season = STORE.currentSeason();
    if (!season) { root.innerHTML = `<h1>Design Optimization</h1>` + noClimateCard(); return; }
    const w = s.weights;
    const opt = s.lastOptimizationResult;

    const weightRow = (key, label) => `
      <div class="form-row"><label>${label} (${Math.round(w[key]*100)}%)</label>
        <input type="range" min="0" max="100" value="${Math.round(w[key]*100)}" data-weight="${key}"></div>`;

    root.innerHTML = `
      <h1>Design Optimization Engine</h1>
      <p class="subtitle">Generates candidate shelter configurations across orientation, insulation, glazing, window
      area, and thermal mass — scores each with a configurable weighted multi-criteria formula.</p>

      <div class="card">
        <h3>Scoring Weights (must total 100%)</h3>
        <div class="grid grid-3">
          ${weightRow("comfort", "Thermal Comfort")}
          ${weightRow("retention", "Heat Retention")}
          ${weightRow("solar", "Solar Utilization")}
          ${weightRow("energy", "Energy Efficiency")}
          ${weightRow("cost", "Cost")}
        </div>
        <div id="weightTotal" class="hint"></div>
        <button class="btn btn-accent" id="runOptBtn" style="margin-top:10px;">▶ Run Design Optimization</button>
        <div id="optValidationErrors" hidden></div>
      </div>

      ${opt ? `
      <div class="card" style="margin:16px 0;">
        <h3>Candidate Designs <span class="tag tag-model">${opt.candidatesEvaluated} configurations evaluated</span></h3>
        <div class="table-wrap"><table><thead><tr>
          <th>Design</th><th>Orientation</th><th>Insulation</th><th>Window %</th><th>Glazing</th><th>Thermal Mass</th>
          <th>Comfort</th><th>Retention</th><th>Solar</th><th>Energy</th><th>Cost</th><th>Total Score</th>
        </tr></thead><tbody>
          ${opt.top.map(c => `<tr class="${c.isRecommended ? "highlight-recommended" : ""}">
            <td><b>${c.label}</b>${c.isRecommended ? " ★" : ""}</td>
            <td>${c.params.orient}</td><td>${c.params.insul} mm</td><td>${Math.round(c.params.wpct*100)}%</td>
            <td>${matName(c.params.glz)}</td><td>${c.params.mass} kg</td>
            <td class="num">${c.score.comfort.toFixed(0)}</td><td class="num">${c.score.retention.toFixed(0)}</td>
            <td class="num">${c.score.solar.toFixed(0)}</td><td class="num">${c.score.energyScore.toFixed(0)}</td>
            <td class="num">${c.score.costScore.toFixed(0)}</td><td class="num"><b>${c.score.total.toFixed(1)}</b></td>
          </tr>`).join("")}
        </tbody></table></div>
      </div>

      <div class="recommend-panel" style="margin-bottom:16px;">
        <h2 style="margin-bottom:0;">✅ Recommended Shelter Design — Design ${opt.recommended.label} <span class="tag tag-model">Model Prediction</span></h2>
        <div class="recommend-grid">
          <div class="recommend-item"><div class="k">Orientation</div><div class="v">${opt.recommended.params.orient}-facing</div></div>
          <div class="recommend-item"><div class="k">Dimensions</div><div class="v">${opt.recommended.design.length}m × ${opt.recommended.design.width}m × ${opt.recommended.design.height}m</div></div>
          <div class="recommend-item"><div class="k">Wall</div><div class="v">${matName(opt.recommended.design.wall.materialId)}</div></div>
          <div class="recommend-item"><div class="k">Insulation</div><div class="v">${opt.recommended.params.insul} mm</div></div>
          <div class="recommend-item"><div class="k">Roof</div><div class="v">${matName(opt.recommended.design.roof.materialId)}</div></div>
          <div class="recommend-item"><div class="k">Windows</div><div class="v">${matName(opt.recommended.params.glz)}, ${Math.round(opt.recommended.params.wpct*100)}% of wall area</div></div>
          <div class="recommend-item"><div class="k">Thermal mass</div><div class="v">${opt.recommended.params.mass > 0 ? matName(opt.recommended.design.thermalMass.materialId) + " (" + opt.recommended.params.mass + " kg)" : "None"}</div></div>
          <div class="recommend-item"><div class="k">Comfort duration</div><div class="v">${opt.recommended.result.comfort.comfortHoursPerDay} h/day</div></div>
          <div class="recommend-item"><div class="k">Predicted temp range</div><div class="v">${opt.recommended.result.comfort.minIndoor}–${opt.recommended.result.comfort.maxIndoor} °C</div></div>
          <div class="recommend-item"><div class="k">Solar utilization</div><div class="v">${opt.recommended.result.scores.solarUtilizationPct}%</div></div>
          <div class="recommend-item"><div class="k">Heat loss</div><div class="v">${opt.recommended.result.daily.totalLossKwh} kWh/day</div></div>
          <div class="recommend-item"><div class="k">Thermal performance score</div><div class="v">${opt.recommended.score.total.toFixed(0)}/100</div></div>
        </div>
        <p class="hint" style="margin-top:10px;">Estimated cost: ₹${opt.recommended.cost.toLocaleString("en-IN")} (materials-only planning estimate, not a CPWD/PWD SOR figure — verify with local quotations).</p>
        ${s.location ? `
        <h3 style="margin-top:14px;">Regional Material Availability <span class="tag tag-demo">rule-based estimate</span></h3>
        <div class="table-wrap"><table>
          <tr><th>Material</th><th>Availability</th><th>Est. lead time</th><th>Transport multiplier</th></tr>
          ${[
            ["Wall", opt.recommended.design.wall.materialId],
            ["Roof", opt.recommended.design.roof.materialId],
            ["Wall insulation", opt.recommended.design.wall.insulationMaterialId],
            ["Glazing", opt.recommended.params.glz],
            ...(opt.recommended.params.mass > 0 ? [["Thermal mass", opt.recommended.design.thermalMass.materialId]] : [])
          ].map(([role, matId]) => {
            const av = DATA.materialAvailability(matId, s.location);
            if (!av) return "";
            return `<tr>
              <td>${role} — ${matName(matId)}</td>
              <td>${av.availableLocally ? '<span class="tag tag-input">Locally sourced</span>' : '<span class="tag tag-demo">Import required</span>'}</td>
              <td class="num">${av.leadTimeDays} days</td>
              <td class="num">${av.transportMultiplier}×</td>
            </tr>`;
          }).join("")}
        </table></div>
        <p class="hint" style="margin-top:6px;">Rule-based estimate from each material's sustainability tag and this site's elevation/remoteness — not a supplier directory. Verify with actual local vendors before procurement.</p>
        ` : ""}
        <button class="btn btn-accent btn-sm" id="adoptRecommendedBtn" style="margin-top:6px;">Adopt as current shelter design</button>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h3>Design Comparison (Top 5)</h3>
        <div class="table-wrap"><table><thead><tr><th>Parameter</th>${opt.top.map(c=>`<th>Design ${c.label}${c.isRecommended?" (Recommended)":""}</th>`).join("")}</tr></thead>
        <tbody>
          ${[
            ["Floor area (m²)", c=>c.result.geometry.floorArea.toFixed(1)],
            ["Volume (m³)", c=>c.result.geometry.volume.toFixed(1)],
            ["Wall material", c=>matName(c.design.wall.materialId)],
            ["Roof material", c=>matName(c.design.roof.materialId)],
            ["Insulation (mm)", c=>c.params.insul],
            ["Window area (%)", c=>Math.round(c.params.wpct*100)+"%"],
            ["Orientation", c=>c.params.orient],
            ["Solar gain (kWh/day)", c=>c.result.daily.solarKwh],
            ["Heat loss (kWh/day)", c=>c.result.daily.totalLossKwh],
            ["Min indoor temp (°C)", c=>c.result.comfort.minIndoor],
            ["Max indoor temp (°C)", c=>c.result.comfort.maxIndoor],
            ["Comfort hours/day", c=>c.result.comfort.comfortHoursPerDay],
            ["Energy requirement (kWh/day)", c=>(c.result.daily.heatingReqKwh+c.result.daily.coolingReqKwh).toFixed(2)],
            ["Thermal score", c=>c.score.total.toFixed(1)],
            ["Estimated cost (₹)", c=>c.cost.toLocaleString("en-IN")]
          ].map(([label, fn]) => `<tr><td>${label}</td>${opt.top.map(c=>`<td class="num ${c.isRecommended?"highlight-recommended":""}">${fn(c)}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h3>All Evaluated Candidates <span class="tag tag-model">${opt.candidatesEvaluated} configurations, sortable</span></h3>
        <p class="hint">Click a column header to sort. This is the full candidate set the optimizer scored, not just the top 5 above.</p>
        <button class="btn btn-sm" id="exportCsvBtn" style="margin-bottom:8px;">⬇ Export all candidates to CSV (opens in Excel)</button>
        <div class="table-wrap" style="max-height:420px; overflow-y:auto;">
          <table id="allCandidatesTable"><thead><tr>
            <th data-sort="rank" class="sortable">#</th><th data-sort="orient" class="sortable">Orientation</th>
            <th data-sort="insul" class="sortable">Insulation</th><th data-sort="wpct" class="sortable">Window %</th>
            <th data-sort="glz" class="sortable">Glazing</th><th data-sort="mass" class="sortable">Thermal Mass</th>
            <th data-sort="comfort" class="sortable">Comfort</th><th data-sort="retention" class="sortable">Retention</th>
            <th data-sort="solar" class="sortable">Solar</th><th data-sort="energyScore" class="sortable">Energy</th>
            <th data-sort="costScore" class="sortable">Cost Score</th><th data-sort="cost" class="sortable">Est. Cost (₹)</th>
            <th data-sort="total" class="sortable">Total Score</th>
          </tr></thead><tbody id="allCandidatesBody"></tbody></table>
        </div>
      </div>

      <div class="card">
        <h3>Sensitivity Analysis <span class="tag tag-model">from current baseline design</span></h3>
        <p class="hint">Impact on thermal score (Δ points) when each parameter is improved from the current baseline design.</p>
        <div id="sensChart"></div>
      </div>
      ` : `<div class="card" style="margin-top:16px;"><p class="subtitle">Run optimization to generate and compare candidate designs.</p></div>`}
    `;

    const weightTotalEl = U.qs("#weightTotal", root);
    function refreshWeightTotal() {
      const total = ["comfort","retention","solar","energy","cost"].reduce((a,k)=>a+w[k]*100,0);
      weightTotalEl.textContent = `Current total: ${Math.round(total)}%` + (Math.round(total) !== 100 ? "  (will be normalized on run)" : "");
    }
    refreshWeightTotal();
    U.qsa("[data-weight]", root).forEach(inp => inp.addEventListener("input", () => {
      w[inp.dataset.weight] = parseInt(inp.value) / 100;
      refreshWeightTotal();
    }));

    if (opt) {
      const sens = ENGINE.sensitivityAnalysis(s.design, season, s.simConfig, normalizedWeights(w));
      CH.barChart(U.qs("#sensChart", root), sens.impacts.map(i => ({ label: i.parameter, value: i.deltaScore })));
      U.on("#adoptRecommendedBtn", "click", () => {
        STORE.updateDesign(opt.recommended.design);
        window.APP.toast("Recommended design adopted as current shelter design.");
        window.APP.navigate("designer");
      }, root);

      let allSortKey = "total", allSortDir = "desc";
      renderAllCandidatesRows(root, opt, allSortKey, allSortDir);
      U.qsa("#allCandidatesTable th[data-sort]", root).forEach(th => th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (allSortKey === key) allSortDir = allSortDir === "asc" ? "desc" : "asc";
        else { allSortKey = key; allSortDir = "desc"; }
        renderAllCandidatesRows(root, opt, allSortKey, allSortDir);
      }));
      U.on("#exportCsvBtn", "click", () => {
        const headers = ["Rank", "Orientation", "Insulation (mm)", "Window %", "Glazing", "Thermal Mass (kg)", "Comfort", "Retention", "Solar", "Energy Score", "Cost Score", "Estimated Cost (INR)", "Total Score"];
        const rows = opt.all.map(c => [c.rank, c.params.orient, c.params.insul, Math.round(c.params.wpct * 100), matName(c.params.glz), c.params.mass, c.score.comfort.toFixed(1), c.score.retention.toFixed(1), c.score.solar.toFixed(1), c.score.energyScore.toFixed(1), c.score.costScore.toFixed(1), c.cost, c.score.total.toFixed(1)]);
        window.APP_EXPORT.downloadCsv("areatherm_design_candidates.csv", headers, rows);
        window.APP.toast(`Exported ${opt.all.length} candidates to CSV.`);
      }, root);
    }

    U.on("#runOptBtn", "click", () => {
      const check = window.APP_VALIDATOR.validateDesign(s);
      if (!check.valid) {
        U.showValidationErrors(root, "#optValidationErrors", check.errors);
        window.APP.toast("Fix the highlighted design values before running.");
        return;
      }
      U.showValidationErrors(root, "#optValidationErrors", []);
      const nw = normalizedWeights(w);
      s.weights = nw;
      try {
        const result = ENGINE.runOptimization(s.design, season, s.simConfig, nw);
        STORE.recordOptimization(result);
        window.APP.render();
        window.APP.toast(`Optimization complete — ${result.candidatesEvaluated} candidates evaluated.`);
      } catch (e) {
        alert("Optimization failed: " + e.message);
      }
    }, root);
  };

  function normalizedWeights(w) {
    const total = ["comfort","retention","solar","energy","cost"].reduce((a,k)=>a+w[k],0) || 1;
    const out = {};
    ["comfort","retention","solar","energy","cost"].forEach(k => out[k] = w[k] / total);
    return out;
  }

  // ---------------------------------------------------------------------
  const WHATIF_PRESETS = {
    insulation: { label: "Increase insulation 50mm → 100mm", apply: d => { d.wall.insulationThicknessMm = 100; d.roof.insulationThicknessMm = 100; } },
    window: { label: "Increase window area 10% → 20% of wall area", apply: d => { const geom = ENGINE.computeGeometry(d); d.windows[0].areaEach = geom.wallArea * 0.20; } },
    orientation: { label: "Change orientation East → South", apply: d => { d.orientation = "SOUTH"; d.azimuthDeg = 0; } },
    mass: { label: "Add thermal mass (800 kg stone)", apply: d => { d.thermalMass = { materialId: "mass_stone", massKg: 800, surfaceAreaM2: 6 }; } },
    roof: { label: "Change roof to insulated composite roof", apply: d => { d.roof.materialId = "roof_composite"; } },
    occupancy: { label: "Increase occupancy 2 → 6 persons (seated)", apply: d => { d.occupancy = 6; d.occupancyActivity = "SEATED"; } }
  };

  UI.renderWhatIf = function (root) {
    const s = STORE.get();
    const season = STORE.currentSeason();
    if (!season) { root.innerHTML = `<h1>What-If Analysis</h1>` + noClimateCard(); return; }

    root.innerHTML = `
      <h1>What-If Analysis</h1>
      <p class="subtitle">Compare the current baseline design against a single-parameter change.</p>
      <div class="card">
        <div class="form-row"><label>Scenario</label>
          <select id="whatifPreset">${Object.entries(WHATIF_PRESETS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join("")}</select>
        </div>
        <button class="btn btn-accent" id="runWhatifBtn">▶ Run What-If Comparison</button>
      </div>
      <div id="whatifResults"></div>
    `;

    U.on("#runWhatifBtn", "click", () => {
      const key = U.qs("#whatifPreset", root).value;
      const preset = WHATIF_PRESETS[key];
      const before = JSON.parse(JSON.stringify(s.design));
      const after = JSON.parse(JSON.stringify(s.design));
      preset.apply(after);
      const check = ENGINE.validateDesign(after);
      if (!check.valid) { alert("This scenario produces an invalid design:\n\n- " + check.errors.join("\n- ")); return; }
      const beforeRes = ENGINE.runSimulation(before, season, s.simConfig);
      const afterRes = ENGINE.runSimulation(after, season, s.simConfig);

      const wrap = U.qs("#whatifResults", root);
      wrap.innerHTML = `
        <div class="card" style="margin-top:16px;">
          <h3>${preset.label}</h3>
          <div class="grid grid-4">
            ${[
              ["Comfort hours/day", beforeRes.comfort.comfortHoursPerDay, afterRes.comfort.comfortHoursPerDay, ""],
              ["Total heat loss (kWh/day)", beforeRes.daily.totalLossKwh, afterRes.daily.totalLossKwh, ""],
              ["Solar gain (kWh/day)", beforeRes.daily.solarKwh, afterRes.daily.solarKwh, ""],
              ["Thermal score", beforeRes.scores.thermalComfortScore, afterRes.scores.thermalComfortScore, ""]
            ].map(([label,b,a]) => `<div class="metric-card card">
                <div class="metric-label">${label}</div>
                <div class="metric-value" style="font-size:16px;">${b} → ${a}</div>
                <div class="metric-sub" style="color:${a>=b?'var(--good)':'var(--bad)'}">${a>=b?"+":""}${(a-b).toFixed(2)}</div>
              </div>`).join("")}
          </div>
          ${key === "occupancy" && afterRes.occupancy.note ? `<p class="hint" style="margin-top:10px;"><b>Occupancy note:</b> ${U.esc(afterRes.occupancy.note)}</p>` : ""}
          <h3 style="margin-top:14px;">Indoor Temperature — Before vs After</h3>
          <div id="whatifChart"></div>
        </div>`;
      const dt = s.simConfig.timeStepMinutes / 60;
      CH.lineChart(U.qs("#whatifChart", wrap), [
        { name: "Before", color: "#8b98a6", data: beforeRes.series.map(pt => ({ x: pt.stepIndex*dt, y: pt.tIndoor })) },
        { name: "After", color: "#1f8a9e", data: afterRes.series.map(pt => ({ x: pt.stepIndex*dt, y: pt.tIndoor })) }
      ], { height: 240, yLabel: "°C", xLabel: "Hours", comfortBand: { min: s.design.comfort.min, max: s.design.comfort.max }, tempZones: true });
    }, root);
  };
})();
