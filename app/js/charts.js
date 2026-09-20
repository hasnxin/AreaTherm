/* AreaTherm — dependency-free inline-SVG chart helpers.
   Kept deliberately framework-free so the prototype has zero external
   dependencies; the production port swaps these for ECharts config builders
   (see ARCHITECTURE.md SS6). */

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

  // series: [{name, color, data:[{x,y}]}], options: {width,height,xTicks,yLabel,xLabel,comfortBand:{min,max}}
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

    if (opts.comfortBand) {
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

    series.forEach(s => {
      const pts = s.data.map(d => `${sx(d.x)},${sy(d.y)}`).join(" ");
      svg.appendChild(el("polyline", { points: pts, class: "chart-line", style: `stroke:${s.color}` }));
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
      series.forEach(s => {
        const item = document.createElement("span");
        item.className = "chart-legend-item";
        item.innerHTML = `<i style="background:${s.color}"></i>${s.name}`;
        legend.appendChild(item);
      });
      container.appendChild(legend);
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

  function heatFlowDiagram(container, daily) {
    const rows = [
      { label: "SOLAR INPUT", value: daily.solarKwh, positive: true },
      { label: "INTERNAL GAINS", value: daily.internalKwh, positive: true },
      { label: "WALL LOSS", value: -daily.wallLossKwh, positive: false },
      { label: "ROOF LOSS", value: -daily.roofLossKwh, positive: false },
      { label: "FLOOR LOSS", value: -daily.floorLossKwh, positive: false },
      { label: "OPENING LOSS", value: -daily.openingLossKwh, positive: false },
      { label: "VENTILATION LOSS", value: -daily.ventLossKwh, positive: false },
      { label: "THERMAL MASS EXCHANGE", value: -daily.massExchangeKwh, positive: daily.massExchangeKwh <= 0 },
      { label: "NET ENERGY", value: daily.netKwh, positive: daily.netKwh >= 0, isNet: true }
    ];
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.value)));
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "heatflow";
    rows.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "heatflow-row" + (r.isNet ? " heatflow-net" : "");
      const barWidth = Math.min(100, (Math.abs(r.value) / maxAbs) * 100);
      row.innerHTML = `
        <div class="heatflow-label">${r.label}</div>
        <div class="heatflow-bar-track">
          <div class="heatflow-bar ${r.value >= 0 ? "pos" : "neg"}" style="width:${barWidth}%"></div>
        </div>
        <div class="heatflow-value ${r.value >= 0 ? "pos" : "neg"}">${r.value >= 0 ? "+" : ""}${r.value.toFixed(1)} kWh/day</div>`;
      wrap.appendChild(row);
      if (i < rows.length - 1) {
        const arrow = document.createElement("div");
        arrow.className = "heatflow-arrow";
        arrow.textContent = "↓";
        wrap.appendChild(arrow);
      }
    });
    container.appendChild(wrap);
  }

  // Hourly stacked heat-flow chart: for each hour of a representative day,
  // stacks every positive component (solar, internal gains) above zero and
  // every negative component (wall/roof/floor/opening/vent/mass losses)
  // below zero — the checklist's "hourly heat flow breakdown, visual
  // stacked bar chart" item, distinct from heatFlowDiagram's daily totals.
  // rows: [{hour, solar, internal, wall, roof, floor, opening, vent, mass}]
  //   — sign convention: positive = gain, negative = loss (caller negates
  //   the engine's "positive Q = leaving the shelter" convention).
  function stackedHourlyChart(container, rows, opts) {
    opts = opts || {};
    const width = opts.width || 720, height = opts.height || 300;
    const ml = 50, mr = 16, mt = 14, mb = 30;
    const plotW = width - ml - mr, plotH = height - mt - mb;
    const seriesDefs = [
      { key: "solar", name: "Solar input", color: "#d98a12" },
      { key: "internal", name: "Internal gains", color: "#7a5cff" },
      { key: "wall", name: "Wall loss", color: "#c93b3b" },
      { key: "roof", name: "Roof loss", color: "#e0745f" },
      { key: "floor", name: "Floor loss", color: "#c9793b" },
      { key: "opening", name: "Opening loss", color: "#1f8a9e" },
      { key: "vent", name: "Ventilation loss", color: "#2fb8cf" },
      { key: "mass", name: "Thermal mass exchange", color: "#5b8c5a" }
    ];
    const allVals = rows.flatMap(r => seriesDefs.map(s => r[s.key] || 0));
    const maxAbs = Math.max(50, ...allVals.map(Math.abs));
    const [yMin, yMax] = [-maxAbs * 1.05, maxAbs * 1.05];
    const sy = v => mt + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const y0 = sy(0);
    const barSlot = plotW / rows.length;
    const barW = barSlot * 0.68;

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const yv = yMin + (i / ticks) * (yMax - yMin);
      const y = sy(yv);
      svg.appendChild(el("line", { x1: ml, y1: y, x2: width - mr, y2: y, class: "chart-grid" }));
      svg.appendChild(textEl(ml - 8, y + 4, Math.round(yv), "chart-tick", "end"));
    }
    svg.appendChild(el("line", { x1: ml, y1: y0, x2: width - mr, y2: y0, class: "chart-axis" }));

    rows.forEach((r, i) => {
      const x = ml + i * barSlot + (barSlot - barW) / 2;
      let posOffset = 0, negOffset = 0;
      seriesDefs.forEach(s => {
        const v = r[s.key] || 0;
        if (Math.abs(v) < 1e-6) return;
        if (v >= 0) {
          const yTop = sy(posOffset + v), yBase = sy(posOffset);
          svg.appendChild(el("rect", { x, y: yTop, width: barW, height: Math.max(0, yBase - yTop), fill: s.color }));
          posOffset += v;
        } else {
          const yTop = sy(negOffset), yBase = sy(negOffset + v);
          svg.appendChild(el("rect", { x, y: yTop, width: barW, height: Math.max(0, yBase - yTop), fill: s.color }));
          negOffset += v;
        }
      });
      if (i % Math.max(1, Math.round(rows.length / 12)) === 0) {
        svg.appendChild(textEl(x + barW / 2, height - mb + 16, r.hour + "h", "chart-tick", "middle"));
      }
    });

    if (opts.yLabel) {
      const lbl = textEl(14, mt + plotH / 2, opts.yLabel, "chart-axis-label", "middle");
      lbl.setAttribute("transform", `rotate(-90 14 ${mt + plotH / 2})`);
      svg.appendChild(lbl);
    }

    container.innerHTML = "";
    container.appendChild(svg);
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    seriesDefs.forEach(s => {
      const item = document.createElement("span");
      item.className = "chart-legend-item";
      item.innerHTML = `<i style="background:${s.color}"></i>${s.name}`;
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }

  // Vertical monthly bar chart — NASA POWER monthly solar/temperature series.
  // months: [{month:'JAN', value}]
  function monthlyBarChart(container, months, opts) {
    opts = opts || {};
    const width = opts.width || 640, height = opts.height || 220;
    const ml = 46, mr = 16, mt = 14, mb = 28;
    const plotW = width - ml - mr, plotH = height - mt - mb;
    const values = months.map(m => m.value).filter(Number.isFinite);
    const vMin = Math.min(0, ...values), vMax = Math.max(...values, 0.001);
    const sy = v => mt + plotH - ((v - vMin) / (vMax - vMin)) * plotH;
    const y0 = sy(0);
    const slot = plotW / months.length;
    const barW = slot * 0.6;
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart-svg" });
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const yv = vMin + (i / ticks) * (vMax - vMin);
      const y = sy(yv);
      svg.appendChild(el("line", { x1: ml, y1: y, x2: width - mr, y2: y, class: "chart-grid" }));
      svg.appendChild(textEl(ml - 8, y + 4, Math.round(yv * 10) / 10, "chart-tick", "end"));
    }
    svg.appendChild(el("line", { x1: ml, y1: y0, x2: width - mr, y2: y0, class: "chart-axis" }));
    months.forEach((m, i) => {
      const x = ml + i * slot + (slot - barW) / 2;
      const v = m.value || 0;
      const yTop = sy(Math.max(0, v)), yBase = sy(Math.min(0, v));
      svg.appendChild(el("rect", { x, y: yTop, width: barW, height: Math.max(1, yBase - yTop), class: v >= 0 ? (opts.barClass || "chart-bar-pos") : "chart-bar-neg" }));
      svg.appendChild(textEl(x + barW / 2, height - mb + 15, m.month.slice(0, 3), "chart-tick", "middle"));
    });
    if (opts.yLabel) {
      const lbl = textEl(14, mt + plotH / 2, opts.yLabel, "chart-axis-label", "middle");
      lbl.setAttribute("transform", `rotate(-90 14 ${mt + plotH / 2})`);
      svg.appendChild(lbl);
    }
    container.innerHTML = "";
    container.appendChild(svg);
  }

  return { lineChart, barChart, scatterChart, scoreGauge, heatFlowDiagram, stackedHourlyChart, monthlyBarChart };
})();
