/* AreaTherm — dependency-free inline-SVG chart helpers.
   Kept deliberately framework-free so the prototype has zero external
   dependencies; the production port swaps these for ECharts config builders
   (see ARCHITECTURE.md §6). */

window.APP_CHARTS = (function () {
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function textEl(x, y, text, cls, anchor) {
    const t = el("text", { x, y, class: cls || "chart-label", "text-anchor": anchor || "start" });
    t.textContent = text;
    return t;
  }

  function niceRange(min, max) {
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.1;
    return [min - pad, max + pad];
  }

  // 4-tier comfort-zone coloring for temperature charts — a simplified,
  // temperature-only proxy (not PMV/PPD; humidity/air-speed/clothing aren't
  // modeled here), disclosed as such wherever it's shown.
  const TEMP_ZONES = [
    { max: 15, color: "#3b7fc9", label: "Cold (<15°C)" },
    { max: 27, color: "#2f9d55", label: "Comfortable (15–27°C)" },
    { max: 32, color: "#d9a52f", label: "Warm (27–32°C)" },
    { max: Infinity, color: "#c93b3b", label: "Hot (>32°C)" }
  ];
  function zoneColorFor(temp) { return (TEMP_ZONES.find(z => temp <= z.max) || TEMP_ZONES[TEMP_ZONES.length - 1]).color; }

  // series: [{name, color, data:[{x,y}]}], options: {width,height,xTicks,yLabel,xLabel,comfortBand:{min,max},tempZones:true}
  function lineChart(container, series, opts) {
    opts = opts || {};
    const width = opts.width || 640, height = opts.height || 280;
    const ml = 46, mr = 16, mt = 14, mb = 34;
    const plotW = width - ml - mr, plotH = height - mt - mb;
    const allX = series.flatMap(s => s.data.map(d => d.x));
    const allY = series.flatMap(s => s.data.map(d => d.y));
    let [yMin, yMax] = niceRange(Math.min(...allY, opts.comfortBand ? opts.comfortBand.min : Infinity),
                                  Math.max(...allY, opts.comfortBand ? opts.comfortBand.max : -Infinity));
    const xMin = Math.min(...allX), xMax = Math.max(...allX);
    const sx = x => ml + (xMax > xMin ? (x - xMin) / (xMax - xMin) : 0) * plotW;
    const sy = y => mt + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });

    if (opts.tempZones) {
      let bandStart = yMin;
      TEMP_ZONES.forEach(z => {
        const bandEnd = Math.min(yMax, z.max);
        if (bandEnd > bandStart) {
          svg.appendChild(el("rect", {
            x: ml, y: sy(bandEnd), width: plotW, height: Math.max(0, sy(bandStart) - sy(bandEnd)),
            fill: z.color, opacity: 0.12
          }));
        }
        bandStart = bandEnd;
      });
    } else if (opts.comfortBand) {
      const y1 = sy(opts.comfortBand.max), y2 = sy(opts.comfortBand.min);
      svg.appendChild(el("rect", { x: ml, y: y1, width: plotW, height: Math.max(0, y2 - y1), class: "chart-comfort-band" }));
    }

    // grid + y ticks
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const yv = yMin + (i / ticks) * (yMax - yMin);
      const y = sy(yv);
      svg.appendChild(el("line", { x1: ml, y1: y, x2: width - mr, y2: y, class: "chart-grid" }));
      svg.appendChild(textEl(ml - 8, y + 4, Math.round(yv * 10) / 10, "chart-tick", "end"));
    }
    const xTickCount = Math.min(8, opts.xTicks || 8);
    for (let i = 0; i <= xTickCount; i++) {
      const xv = xMin + (i / xTickCount) * (xMax - xMin);
      const x = sx(xv);
      svg.appendChild(textEl(x, height - mb + 16, opts.xFormat ? opts.xFormat(xv) : Math.round(xv), "chart-tick", "middle"));
    }
    svg.appendChild(el("line", { x1: ml, y1: mt + plotH, x2: width - mr, y2: mt + plotH, class: "chart-axis" }));
    svg.appendChild(el("line", { x1: ml, y1: mt, x2: ml, y2: mt + plotH, class: "chart-axis" }));

    series.forEach((s, si) => {
      if (opts.tempZones) {
        const dash = si > 0 ? "5 4" : "none";
        for (let i = 1; i < s.data.length; i++) {
          const a = s.data[i - 1], b = s.data[i];
          const midY = zoneColorFor((a.y + b.y) / 2);
          svg.appendChild(el("polyline", {
            points: `${sx(a.x)},${sy(a.y)} ${sx(b.x)},${sy(b.y)}`,
            style: `stroke:${midY};stroke-width:2.5;fill:none;stroke-dasharray:${dash};`
          }));
        }
      } else {
        const pts = s.data.map(d => `${sx(d.x)},${sy(d.y)}`).join(" ");
        svg.appendChild(el("polyline", { points: pts, class: "chart-line", style: `stroke:${s.color}` }));
      }
    });

    if (opts.yLabel) {
      const lbl = textEl(14, mt + plotH / 2, opts.yLabel, "chart-axis-label", "middle");
      lbl.setAttribute("transform", `rotate(-90 14 ${mt + plotH / 2})`);
      svg.appendChild(lbl);
    }
    if (opts.xLabel) svg.appendChild(textEl(ml + plotW / 2, height - 4, opts.xLabel, "chart-axis-label", "middle"));

    container.innerHTML = "";
    container.appendChild(svg);

    if (series.length > 1 || opts.legend) {
      const legend = document.createElement("div");
      legend.className = "chart-legend";
      series.forEach((s, si) => {
        const item = document.createElement("span");
        item.className = "chart-legend-item";
        item.innerHTML = opts.tempZones
          ? `<i style="background:none;border-bottom:2px ${si > 0 ? "dashed" : "solid"} #555;width:14px;height:0;"></i>${s.name}`
          : `<i style="background:${s.color}"></i>${s.name}`;
        legend.appendChild(item);
      });
      container.appendChild(legend);
    }

    if (opts.tempZones) {
      const zoneLegend = document.createElement("div");
      zoneLegend.className = "chart-legend";
      zoneLegend.style.marginTop = "2px";
      TEMP_ZONES.forEach(z => {
        const item = document.createElement("span");
        item.className = "chart-legend-item";
        item.innerHTML = `<i style="background:${z.color}"></i>${z.label}`;
        zoneLegend.appendChild(item);
      });
      container.appendChild(zoneLegend);
      const note = document.createElement("p");
      note.className = "hint";
      note.style.margin = "2px 0 0";
      note.textContent = "Temperature-only comfort proxy — humidity, air speed and clothing aren't factored into this coloring.";
      container.appendChild(note);
    }
  }

  function barChart(container, items, opts) {
    opts = opts || {};
    const width = opts.width || 560, barH = 26, gap = 10;
    const height = items.length * (barH + gap) + 20;
    const ml = opts.labelWidth || 170, mr = 60;
    const plotW = width - ml - mr;
    const maxAbs = Math.max(1, ...items.map(i => Math.abs(i.value)));
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });
    items.forEach((it, i) => {
      const y = 10 + i * (barH + gap);
      svg.appendChild(textEl(ml - 10, y + barH / 2 + 4, it.label, "chart-tick", "end"));
      const w = (Math.abs(it.value) / maxAbs) * plotW;
      const x = it.value >= 0 ? ml : ml - w;
      svg.appendChild(el("rect", { x, y, width: Math.max(1, w), height: barH, class: it.value >= 0 ? "chart-bar-pos" : "chart-bar-neg" }));
      svg.appendChild(textEl(ml + (it.value >= 0 ? w + 6 : -w - 6), y + barH / 2 + 4, (it.value >= 0 ? "+" : "") + it.value, "chart-tick", it.value >= 0 ? "start" : "end"));
    });
    container.innerHTML = "";
    container.appendChild(svg);
  }

  function scatterChart(container, points, opts) {
    opts = opts || {};
    const width = opts.width || 420, height = opts.height || 320;
    const ml = 46, mr = 16, mt = 14, mb = 34;
    const plotW = width - ml - mr, plotH = height - mt - mb;
    const allX = points.map(p => p.x), allY = points.map(p => p.y);
    const lo = Math.min(...allX, ...allY), hi = Math.max(...allX, ...allY);
    const [mn, mx] = niceRange(lo, hi);
    const s = v => ({ x: ml + ((v - mn) / (mx - mn)) * plotW, y: mt + plotH - ((v - mn) / (mx - mn)) * plotH });
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });
    svg.appendChild(el("line", { x1: ml, y1: mt + plotH, x2: width - mr, y2: mt + plotH, class: "chart-axis" }));
    svg.appendChild(el("line", { x1: ml, y1: mt, x2: ml, y2: mt + plotH, class: "chart-axis" }));
    const p1 = s(mn), p2 = s(mx);
    svg.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: "chart-ideal-line" }));
    points.forEach(p => {
      const c = s(p.x);
      svg.appendChild(el("circle", { cx: c.x, cy: mt + plotH - (c.y - mt), r: 4, class: "chart-point" }));
    });
    // fix y mapping (SVG y grows downward) — recompute properly
    container.innerHTML = "";
    svg.querySelectorAll("circle").forEach((c, idx) => {
      const p = points[idx];
      const px = ml + ((p.x - mn) / (mx - mn)) * plotW;
      const py = mt + plotH - ((p.y - mn) / (mx - mn)) * plotH;
      c.setAttribute("cx", px); c.setAttribute("cy", py);
    });
    svg.appendChild(textEl(ml + plotW / 2, height - 4, opts.xLabel || "Measured (°C)", "chart-axis-label", "middle"));
    const lbl = textEl(14, mt + plotH / 2, opts.yLabel || "Predicted (°C)", "chart-axis-label", "middle");
    lbl.setAttribute("transform", `rotate(-90 14 ${mt + plotH / 2})`);
    svg.appendChild(lbl);
    container.appendChild(svg);
  }

  function scoreGauge(container, score, sublabel) {
    const size = 140, stroke = 12, r = (size - stroke) / 2, c = size / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
    const color = score >= 80 ? "var(--good)" : score >= 60 ? "var(--warn)" : "var(--bad)";
    container.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}" class="gauge-svg">
        <circle cx="${c}" cy="${c}" r="${r}" class="gauge-track" stroke-width="${stroke}" fill="none"/>
        <circle cx="${c}" cy="${c}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
          transform="rotate(-90 ${c} ${c})"/>
        <text x="${c}" y="${c - 4}" text-anchor="middle" class="gauge-score">${Math.round(score)}</text>
        <text x="${c}" y="${c + 18}" text-anchor="middle" class="gauge-max">/100</text>
      </svg>
      ${sublabel ? `<div class="gauge-sublabel">${sublabel}</div>` : ""}`;
  }

  // Single consolidated diverging bar: every gain component stacks to the
  // left of a center zero-line, every loss component stacks to the right,
  // both sides sharing one scale so bar length is directly comparable.
  // Net balance is called out separately below the bar (it's a derived
  // summary value, not a stackable segment).
  function stackedHeatBalanceChart(container, daily) {
    const GAIN_COLOR = ["#2f9d55", "#5cbf7d"];
    const LOSS_COLOR = ["#c93b3b", "#d9695f", "#e08a5a", "#b4544a", "#8a5ac9"];
    const gains = [
      { label: "Solar Input", value: daily.solarKwh },
      { label: "Internal Gains", value: daily.internalKwh }
    ];
    const losses = [
      { label: "Wall Loss", value: daily.wallLossKwh },
      { label: "Roof Loss", value: daily.roofLossKwh },
      { label: "Floor Loss", value: daily.floorLossKwh },
      { label: "Opening Loss", value: daily.openingLossKwh },
      { label: "Ventilation Loss", value: daily.ventLossKwh }
    ];
    // Thermal mass exchange can be either a net gain (mass releasing heat
    // to the air) or a net loss (air charging the mass) depending on sign.
    if (daily.massExchangeKwh <= 0) gains.push({ label: "Thermal Mass (releasing)", value: -daily.massExchangeKwh });
    else losses.push({ label: "Thermal Mass (charging)", value: daily.massExchangeKwh });

    const width = 660, height = 150, barY = 48, barH = 40, margin = 20;
    const cx = width / 2;
    const halfW = width / 2 - margin;
    const totalGains = gains.reduce((s, g) => s + g.value, 0);
    const totalLosses = losses.reduce((s, l) => s + l.value, 0);
    const scale = halfW / Math.max(1, totalGains, totalLosses);

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });
    svg.appendChild(el("line", { x1: cx, y1: barY - 8, x2: cx, y2: barY + barH + 8, class: "chart-axis" }));

    let running = 0;
    gains.forEach((g, i) => {
      const w = g.value * scale;
      const x = cx - (running + g.value) * scale;
      svg.appendChild(el("rect", { x, y: barY, width: Math.max(0, w), height: barH, fill: GAIN_COLOR[i % GAIN_COLOR.length] }));
      if (w > 36) svg.appendChild(textEl(x + w / 2, barY + barH / 2 + 4, g.value.toFixed(1), "chart-tick", "middle"));
      running += g.value;
    });
    running = 0;
    losses.forEach((l, i) => {
      const w = l.value * scale;
      const x = cx + running * scale;
      svg.appendChild(el("rect", { x, y: barY, width: Math.max(0, w), height: barH, fill: LOSS_COLOR[i % LOSS_COLOR.length] }));
      if (w > 36) svg.appendChild(textEl(x + w / 2, barY + barH / 2 + 4, "-" + l.value.toFixed(1), "chart-tick", "middle"));
      running += l.value;
    });

    svg.appendChild(textEl(cx - halfW / 2, barY - 14, "GAINS", "chart-axis-label", "middle"));
    svg.appendChild(textEl(cx + halfW / 2, barY - 14, "LOSSES", "chart-axis-label", "middle"));
    svg.appendChild(textEl(cx - halfW / 2, barY + barH + 22, `Total: +${totalGains.toFixed(1)} kWh/day`, "chart-tick", "middle"));
    svg.appendChild(textEl(cx + halfW / 2, barY + barH + 22, `Total: -${totalLosses.toFixed(1)} kWh/day`, "chart-tick", "middle"));
    const netEl = textEl(cx, barY + barH + 42, `Net energy balance: ${daily.netKwh >= 0 ? "+" : ""}${daily.netKwh.toFixed(1)} kWh/day`, "chart-axis-label", "middle");
    netEl.style.fontWeight = "700";
    svg.appendChild(netEl);

    container.innerHTML = "";
    container.appendChild(svg);
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    gains.concat(losses).forEach((s, i) => {
      const color = i < gains.length ? GAIN_COLOR[i % GAIN_COLOR.length] : LOSS_COLOR[(i - gains.length) % LOSS_COLOR.length];
      const item = document.createElement("span");
      item.className = "chart-legend-item";
      item.innerHTML = `<i style="background:${color}"></i>${s.label}`;
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }

  // Hourly heat-flow breakdown: gains stacked upward from 0, losses stacked
  // downward, net balance as a bold line on top. Reads engine.js's raw
  // per-step series (qSolarWindow, qInternal are gains in W; qWall, qRoof,
  // qFloor, qWindowCond+qDoorCond, qVent are positive-when-losing-heat in
  // the engine's convention, so they're negated here to draw below zero).
  // A shared crosshair + tooltip on mousemove shows every component's exact
  // value at that hour.
  function hourlyHeatFlowChart(container, series, opts) {
    opts = opts || {};
    const width = opts.width || 640, height = opts.height || 300;
    const ml = 50, mr = 16, mt = 14, mb = 34;
    const plotW = width - ml - mr, plotH = height - mt - mb;

    const GAIN_SERIES = [
      { key: "qSolarWindow", label: "Solar Input", color: "#e8a23c" },
      { key: "qInternal", label: "Internal Gains", color: "#d9cf3c" }
    ];
    const LOSS_SERIES = [
      { key: "qWall", label: "Wall Loss", color: "#c93b3b" },
      { key: "qRoof", label: "Roof Loss", color: "#e06a6a" },
      { key: "qFloor", label: "Floor Loss", color: "#a52d2d" },
      { key: "qOpening", label: "Opening Loss", color: "#e08a5a" },
      { key: "qVent", label: "Ventilation Loss", color: "#8a5ac9" }
    ];
    const rows = series.map(s => ({
      hourDecimal: s.hourDecimal,
      qSolarWindow: Math.max(0, s.qSolarWindow), qInternal: Math.max(0, s.qInternal),
      qWall: Math.max(0, s.qWall), qRoof: Math.max(0, s.qRoof), qFloor: Math.max(0, s.qFloor),
      qOpening: Math.max(0, s.qWindowCond + s.qDoorCond), qVent: Math.max(0, s.qVent),
      qNet: s.qNet
    }));

    const allX = rows.map(r => r.hourDecimal);
    const xMin = Math.min(...allX), xMax = Math.max(...allX);
    const gainTotals = rows.map(r => GAIN_SERIES.reduce((s, g) => s + r[g.key], 0));
    const lossTotals = rows.map(r => -LOSS_SERIES.reduce((s, l) => s + r[l.key], 0));
    const netVals = rows.map(r => r.qNet);
    let [yMin, yMax] = niceRange(Math.min(...lossTotals, ...netVals, 0), Math.max(...gainTotals, ...netVals, 0));
    const sx = x => ml + (xMax > xMin ? (x - xMin) / (xMax - xMin) : 0) * plotW;
    const sy = y => mt + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });

    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const yv = yMin + (i / ticks) * (yMax - yMin);
      const y = sy(yv);
      svg.appendChild(el("line", { x1: ml, y1: y, x2: width - mr, y2: y, class: "chart-grid" }));
      svg.appendChild(textEl(ml - 8, y + 4, Math.round(yv), "chart-tick", "end"));
    }
    const xTickCount = Math.min(8, rows.length - 1 || 1);
    for (let i = 0; i <= xTickCount; i++) {
      const xv = xMin + (i / xTickCount) * (xMax - xMin);
      svg.appendChild(textEl(sx(xv), height - mb + 16, Math.round(xv) + "h", "chart-tick", "middle"));
    }
    svg.appendChild(el("line", { x1: ml, y1: sy(0), x2: width - mr, y2: sy(0), class: "chart-axis" }));
    svg.appendChild(el("line", { x1: ml, y1: mt, x2: ml, y2: mt + plotH, class: "chart-axis" }));

    // Stack helper: draws each series as a filled band on top of the
    // running cumulative total, walking the list in the given direction.
    function stack(list, sign) {
      let running = rows.map(() => 0);
      list.forEach(s => {
        const top = rows.map((r, i) => running[i] + sign * r[s.key]);
        const pathTop = rows.map((r, i) => `${sx(r.hourDecimal)},${sy(top[i])}`);
        const pathBottom = rows.map((r, i) => `${sx(r.hourDecimal)},${sy(running[i])}`).reverse();
        svg.appendChild(el("polygon", { points: pathTop.concat(pathBottom).join(" "), fill: s.color, opacity: 0.75, stroke: "none" }));
        running = top;
      });
    }
    stack(GAIN_SERIES, 1);
    stack(LOSS_SERIES, -1);

    const netPts = rows.map(r => `${sx(r.hourDecimal)},${sy(r.qNet)}`).join(" ");
    svg.appendChild(el("polyline", { points: netPts, class: "chart-line", style: "stroke:#152233;stroke-width:2.5" }));

    if (opts.yLabel) {
      const lbl = textEl(14, mt + plotH / 2, opts.yLabel, "chart-axis-label", "middle");
      lbl.setAttribute("transform", `rotate(-90 14 ${mt + plotH / 2})`);
      svg.appendChild(lbl);
    }
    if (opts.xLabel) svg.appendChild(textEl(ml + plotW / 2, height - 4, opts.xLabel, "chart-axis-label", "middle"));

    // Crosshair + tooltip: an invisible full-height hit rect tracks the
    // mouse and snaps to the nearest hour's data row.
    const crosshair = el("line", { x1: 0, y1: mt, x2: 0, y2: mt + plotH, class: "chart-crosshair", style: "display:none;" });
    svg.appendChild(crosshair);
    const hit = el("rect", { x: ml, y: mt, width: plotW, height: plotH, fill: "transparent", style: "cursor:crosshair;" });
    svg.appendChild(hit);

    container.innerHTML = "";
    container.style.position = "relative";
    container.appendChild(svg);

    const legend = document.createElement("div");
    legend.className = "chart-legend";
    GAIN_SERIES.concat(LOSS_SERIES).concat([{ label: "Net", color: "#152233" }]).forEach(s => {
      const item = document.createElement("span");
      item.className = "chart-legend-item";
      item.innerHTML = `<i style="background:${s.color}"></i>${s.label}`;
      legend.appendChild(item);
    });
    container.appendChild(legend);

    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.hidden = true;
    container.appendChild(tooltip);

    hit.addEventListener("mousemove", (e) => {
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * width;
      const xv = xMin + ((px - ml) / plotW) * (xMax - xMin);
      let nearest = rows[0], best = Infinity;
      rows.forEach(r => { const d = Math.abs(r.hourDecimal - xv); if (d < best) { best = d; nearest = r; } });
      crosshair.setAttribute("x1", sx(nearest.hourDecimal)); crosshair.setAttribute("x2", sx(nearest.hourDecimal));
      crosshair.style.display = "";
      tooltip.hidden = false;
      tooltip.innerHTML = `<b>Hour ${Math.round(nearest.hourDecimal)}:00</b>` +
        GAIN_SERIES.concat(LOSS_SERIES).map(s => `<div><i style="background:${s.color}"></i>${s.label}: ${Math.round(nearest[s.key] * (LOSS_SERIES.includes(s) ? -1 : 1))} W</div>`).join("") +
        `<div><b>Net: ${Math.round(nearest.qNet)} W</b></div>`;
      const leftPct = (sx(nearest.hourDecimal) / width) * 100;
      tooltip.style.left = Math.min(70, leftPct) + "%";
    });
    hit.addEventListener("mouseleave", () => { crosshair.style.display = "none"; tooltip.hidden = true; });
  }

  // Vertical bar chart for monthly climate normals: one bar per month at
  // its mean value, with a min/max whisker when the source provides both
  // (real NASA POWER T2M_MAX/T2M_MIN — never fabricated).
  // months: [{label, mean, min?, max?}]
  function monthlyBarChart(container, months, opts) {
    opts = opts || {};
    const width = opts.width || 640, height = opts.height || 260;
    const ml = 46, mr = 16, mt = 14, mb = 30;
    const plotW = width - ml - mr, plotH = height - mt - mb;
    const hasRange = months.every(m => m.min != null && m.max != null);
    const allVals = months.flatMap(m => hasRange ? [m.min, m.max] : [m.mean]);
    let [yMin, yMax] = niceRange(Math.min(...allVals, 0), Math.max(...allVals));
    const sy = y => mt + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
    const bw = plotW / months.length;
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });

    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const yv = yMin + (i / ticks) * (yMax - yMin);
      const y = sy(yv);
      svg.appendChild(el("line", { x1: ml, y1: y, x2: width - mr, y2: y, class: "chart-grid" }));
      svg.appendChild(textEl(ml - 8, y + 4, Math.round(yv * 10) / 10, "chart-tick", "end"));
    }
    months.forEach((m, i) => {
      const cx = ml + i * bw + bw / 2;
      const barW = bw * 0.5;
      svg.appendChild(el("rect", {
        x: cx - barW / 2, y: sy(m.mean), width: barW, height: Math.max(1, sy(0) - sy(m.mean)),
        class: m.mean >= 0 ? "chart-bar-pos" : "chart-bar-neg"
      }));
      if (hasRange) {
        svg.appendChild(el("line", { x1: cx, y1: sy(m.max), x2: cx, y2: sy(m.min), class: "chart-axis", "stroke-width": 1.5 }));
        svg.appendChild(el("line", { x1: cx - 4, y1: sy(m.max), x2: cx + 4, y2: sy(m.max), class: "chart-axis" }));
        svg.appendChild(el("line", { x1: cx - 4, y1: sy(m.min), x2: cx + 4, y2: sy(m.min), class: "chart-axis" }));
      }
      svg.appendChild(textEl(cx, height - mb + 16, m.label, "chart-tick", "middle"));
    });
    svg.appendChild(el("line", { x1: ml, y1: sy(0), x2: width - mr, y2: sy(0), class: "chart-axis" }));
    if (opts.yLabel) {
      const lbl = textEl(14, mt + plotH / 2, opts.yLabel, "chart-axis-label", "middle");
      lbl.setAttribute("transform", `rotate(-90 14 ${mt + plotH / 2})`);
      svg.appendChild(lbl);
    }
    container.innerHTML = "";
    container.appendChild(svg);
    if (hasRange) {
      const note = document.createElement("p");
      note.className = "hint";
      note.style.marginTop = "4px";
      note.textContent = "Bar = monthly mean, whisker = climatological min/max (NASA POWER).";
      container.appendChild(note);
    }
  }

  return { lineChart, barChart, scatterChart, scoreGauge, hourlyHeatFlowChart, monthlyBarChart, stackedHeatBalanceChart };
})();
