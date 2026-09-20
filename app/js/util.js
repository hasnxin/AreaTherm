/* AreaTherm — small shared UI helpers. */
window.U = {
  n(x, d) { d = d == null ? 1 : d; return Number.isFinite(x) ? x.toFixed(d) : "—"; },
  qs(sel, root) { return (root || document).querySelector(sel); },
  qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
  on(sel, evt, fn, root) { const e = this.qs(sel, root); if (e) e.addEventListener(evt, fn); },
  esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); },
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
