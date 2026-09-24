/* AreaTherm — small shared UI helpers. */
window.U = {
  n(x, d) { d = d == null ? 1 : d; return Number.isFinite(x) ? x.toFixed(d) : "—"; },
  // Parses a form value to a float, falling back when it's empty/NaN —
  // unlike `parseFloat(v) || fallback`, this correctly keeps a legitimate 0.
  numOr(v, fallback) { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; },
  qs(sel, root) { return (root || document).querySelector(sel); },
  qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
  on(sel, evt, fn, root) { const e = this.qs(sel, root); if (e) e.addEventListener(evt, fn); },
  esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); },

  // Consistent page-header block (icon + title + subtitle, optional
  // right-aligned actions) used by every page except Dashboard (which
  // keeps its hero instead). `icon` is one of the same emoji already
  // assigned per-route in index.html's sidebar nav / ui-1.js's
  // EXPLORE_TILES — no new icon vocabulary. `subtitle`/`actionsHtml` are
  // trusted HTML from this app's own template strings, same as every
  // other *Html() helper in this codebase (not user input).
  pageHeader(icon, title, subtitle, actionsHtml) {
    return `<div class="page-header">
      <div class="page-header-icon">${icon}</div>
      <div class="page-header-text"><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>
      ${actionsHtml ? `<div class="page-header-actions">${actionsHtml}</div>` : ""}
    </div>`;
  },

  // Shared "nothing here yet" component — replaces a bare <p class="hint">
  // wherever a page has no data to show. ctaHtml is typically a link to
  // wherever the user should go to produce that data.
  emptyState(icon, message, ctaHtml) {
    return `<div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <p>${message}</p>
      ${ctaHtml ? `<div class="empty-state-cta">${ctaHtml}</div>` : ""}
    </div>`;
  },

  // Shape-aware dimension text for a design. design.length/width only hold
  // meaningful values for a RECTANGULAR footprint: SQUARE overrides width
  // to match length inside computeGeometry (so the raw stored value can be
  // stale or just unused), and round/L-shaped designs use entirely
  // different fields (diameter, or the L-shape's wing dimensions). Every
  // place that displays "the shelter's dimensions" should call this rather
  // than reading design.length/width/diameter directly, so they can't
  // silently drift out of sync with what computeGeometry actually uses.
  shapeDimensionsText(design) {
    if (design.shape === "L_SHAPE") {
      return `Wing A ${design.lengthA || 4}m × ${design.widthA || 4}m + Wing B ${design.lengthB || 3}m × ${design.widthB || 3}m, ${design.height}m height`;
    }
    if (["CIRCULAR", "DOME", "SEMI_CIRCULAR"].includes(design.shape)) {
      return `⌀ ${design.diameter || 5}m, ${design.height}m height`;
    }
    if (design.shape === "SQUARE") {
      const geom = window.APP_ENGINE.computeGeometry(design);
      return `${geom.L}m × ${geom.L}m × ${design.height}m`;
    }
    return `${design.length}m × ${design.width}m × ${design.height}m`;
  },

  // Trailing-edge debounce: fn runs `delay` ms after the last call. The
  // returned function also exposes .flush() (run immediately, e.g. on blur)
  // and .cancel() (drop any pending call).
  debounce(fn, delay) {
    let timer = null, pendingArgs = null;
    const debounced = (...args) => {
      pendingArgs = args;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(...pendingArgs); }, delay);
    };
    debounced.flush = () => {
      if (timer) { clearTimeout(timer); timer = null; fn(...(pendingArgs || [])); }
    };
    debounced.cancel = () => { clearTimeout(timer); timer = null; };
    return debounced;
  },
  // Data-source transparency badge. Accepts a state.climateSource-shaped
  // object: { label, period, tier: 'LIVE'|'FRESH_CACHE'|'STALE_CACHE' } (the
  // normal case, from store.js buildClimateSource) or the older
  // { label, period, type: 'REAL'|... } shape for any caller that hasn't
  // been updated to pass a tier. STALE_CACHE always renders as a visible
  // warning — a fallback tier must never look identical to a live fetch.
  badge(src) {
    if (!src) return "";
    let cls, icon;
    if (src.tier) {
      cls = src.tier === "STALE_CACHE" ? "illustrative" : "real";
      icon = src.tier === "STALE_CACHE" ? "⚠" : "✓";
    } else {
      const isReal = src.type === "REAL";
      cls = isReal ? "real" : "illustrative";
      icon = isReal ? "✓" : "⚠";
    }
    const period = src.period ? ` — ${this.esc(src.period)}` : "";
    const titleAttr = src.tierError ? ` title="${this.esc(src.tierError)}"` : "";
    return `<span class="data-badge ${cls}"${titleAttr}>${icon} Data source: ${this.esc(src.label)}${period}</span>`;
  },

  // Resilient JSON fetch: aborts a hung request after `timeoutMs`, retries
  // up to `retries` more times with exponential backoff, and calls
  // `onRetry(attemptNumber, maxAttempts)` before each retry so the caller
  // can surface a "retrying…" message. Throws the last error if every
  // attempt fails — callers decide whether to fall back to cache.
  async fetchJsonWithRetry(url, opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs || 5000;
    const backoffMs = opts.backoffMs || [1000, 2000];
    const maxAttempts = (opts.retries != null ? opts.retries : 2) + 1;
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const wait = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)];
        await new Promise(r => setTimeout(r, wait));
        if (opts.onRetry) opts.onRetry(attempt + 1, maxAttempts);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) { lastErr = new Error("HTTP " + resp.status); continue; }
        return await resp.json();
      } catch (e) {
        clearTimeout(timer);
        lastErr = e.name === "AbortError" ? new Error("Request timed out") : e;
      }
    }
    throw lastErr || new Error("Request failed");
  },

  // Classifies the loaded climate into a plain-language zone label. Rule-
  // based on the live-fetched season + (when available) NASA POWER's
  // annual mean — not a formal Köppen classification, just an orientation
  // aid for the recommendations below and the climate-card export.
  classifyClimate(location, season) {
    if (!season) return null;
    const annualAvg = (location && location.avgTempCAnnual != null) ? location.avgTempCAnnual : (season.tMin + season.tMax) / 2;
    if (annualAvg < 10) return "Cold Mountain";
    if (season.tMin < 0) return "Temperate (cold nights)";
    if (season.rhPct > 70) return "Monsoon / Humid";
    if (season.tMax > 35) return "Warm Plain";
    return "Temperate";
  },

  // Rule-based "what matters most here" guidance, derived from the actual
  // loaded numbers (not a canned per-city string) — top 3 by priority.
  // Each item: { text, reason }.
  climateRecommendations(location, season) {
    if (!season) return [];
    const swing = season.tMax - season.tMin;
    const candidates = [];
    if (season.tMin < 5) {
      candidates.push({ priority: 10, text: "High wall/roof insulation", reason: `nights drop to ${season.tMin}°C — heat retention matters most here` });
    }
    if (season.tMax > 32) {
      candidates.push({ priority: 10, text: "Minimize window area, favor light-colored/reflective finishes", reason: `daytime highs reach ${season.tMax}°C — overheating is the main risk` });
    }
    if (season.solarKwhDay > 5 && season.tMin < 10) {
      candidates.push({ priority: 9, text: "South-facing orientation with generous glazing", reason: `strong solar resource (${season.solarKwhDay} kWh/m²/day) in a cold climate — capture winter solar gain` });
    }
    if (swing > 12) {
      candidates.push({ priority: 8, text: "Add thermal mass (stone, water, or PCM)", reason: `${swing.toFixed(0)}°C day-night swing — mass buffers the indoor temperature` });
    }
    if (season.windMs > 4) {
      candidates.push({ priority: 7, text: "Tight envelope / low air leakage (ACH)", reason: `${season.windMs} m/s average wind increases infiltration losses` });
    }
    if (season.rhPct > 70) {
      candidates.push({ priority: 7, text: "Prioritize ventilation over sealing", reason: `${season.rhPct}% humidity — moisture management matters more than heat retention` });
    }
    if (season.tMax < 28 && season.tMin > 5 && swing <= 12) {
      candidates.push({ priority: 3, text: "Balanced insulation and moderate window area", reason: "mild climate — no single factor dominates the design" });
    }
    return candidates.sort((a, b) => b.priority - a.priority).slice(0, 3);
  },

  // Metric → Imperial display conversions. The engine and internal state
  // always stay metric; these are for on-screen display only, applied
  // wherever a screen has actually been wired to check STORE units
  // (currently the Settings page's own unit-label list).
  cToF(c) { return c * 9 / 5 + 32; },
  mToFt(m) { return m * 3.28084; },
  mmToIn(mm) { return mm / 25.4; },
  wToBtuH(w) { return w * 3.41214; },
  msToMph(ms) { return ms * 2.23694; },

  // Resolves a lat/lon to a short place name via OpenStreetMap Nominatim
  // (free, no key). Returns null on any failure — callers fall back to
  // "Unknown location — using entered coordinates" rather than blocking.
  async reverseGeocode(lat, lon) {
    try {
      const j = await this.fetchJsonWithRetry(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
        { timeoutMs: 5000, retries: 1 }
      );
      const a = j.address || {};
      const place = a.city || a.town || a.village || a.county || a.state_district || a.state || null;
      return place ? { name: place, region: a.state || a.county || "" } : null;
    } catch (e) { return null; }
  },

  // Renders a validator's error list into a container and highlights the
  // first field that has one, so the user sees exactly what to fix. The
  // offending field only actually lives on this page when this is called
  // from the Shelter Designer itself — from every other caller (Guided
  // Setup's Run step, Thermal Simulation, Optimization) the field was set
  // on a different page/step, so there's nothing here to scroll to or
  // focus; a link to the Shelter Designer is shown instead so the user
  // still knows where to go, rather than the box silently doing nothing.
  showValidationErrors(root, containerSel, errors) {
    const box = this.qs(containerSel, root);
    if (!box) return;
    if (!errors || !errors.length) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    this.qsa("[data-field-invalid]", root).forEach(el => el.removeAttribute("data-field-invalid"));
    const first = errors.find(e => e.field);
    const el = first ? this.qs("#" + first.field, root) : null;
    if (el) {
      el.setAttribute("data-field-invalid", "true");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
    box.innerHTML = `<div class="validation-errors"><b>Fix before running:</b><ul>${
      errors.map(e => `<li>${this.esc(e.message)}</li>`).join("")
    }</ul>${!el ? `<p style="margin:6px 0 0;">These are design/geometry values — <a href="#/designer" style="color:inherit;font-weight:600;">go to Shelter Designer</a> to fix them.</p>` : ""}</div>`;
  },

  // Triggers a browser download of in-memory text content (CSV, etc.) with
  // no server round-trip and no external library — works fully offline.
  downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
