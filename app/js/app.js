/* AreaTherm — router + bootstrap */
window.APP = (function () {
  const STORE = window.APP_STORE, ENGINE = window.APP_ENGINE, CFG = window.APP_CONFIG;
  const viewRoot = () => document.getElementById("viewRoot");

  const ROUTES = {
    dashboard: window.UI.renderDashboard,
    guided: window.UI.renderGuided,
    location: window.UI.renderLocation,
    designer: window.UI.renderDesigner,
    materials: window.UI.renderMaterials,
    simulation: window.UI.renderSimulation,
    optimization: window.UI.renderOptimization,
    whatif: window.UI.renderWhatIf,
    validation: window.UI.renderValidation,
    reports: window.UI.renderReport,
    evaluator: window.UI.renderEvaluator,
    settings: window.UI.renderSettings
  };

  function currentRoute() {
    const hash = location.hash.replace("#/", "");
    return ROUTES[hash] ? hash : "dashboard";
  }

  // Global exception handler around every screen render: a bug in one
  // screen shows a clean recoverable message instead of a blank page or a
  // raw stack trace, and the real error still goes to the console for
  // debugging. This is the last line of defence — most user-triggered
  // actions (running a simulation, loading weather) validate their inputs
  // and catch their own errors first with a more specific message.
  function renderErrorCard(route, err) {
    console.error("AreaTherm render error on route '" + route + "':", err);
    viewRoot().innerHTML = `
      <div class="card callout-error">
        <h3>Something went wrong displaying this screen</h3>
        <p class="subtitle" style="margin-bottom:10px;">${U.esc(err && err.message ? err.message : String(err))}</p>
        <p class="hint">Your project data has not been lost — it's saved automatically. Try
        <a href="#/dashboard" style="color:var(--accent);font-weight:600;">returning to the Dashboard</a>
        or reloading the page. If this keeps happening, check the browser console for details.</p>
      </div>`;
  }

  function render() {
    const route = currentRoute();
    document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.dataset.route === route));
    document.getElementById("projectName").textContent = STORE.get().project.name;
    try {
      ROUTES[route](viewRoot());
    } catch (err) {
      renderErrorCard(route, err);
    }
    document.body.classList.toggle("mode-advanced", STORE.get().mode === "ADVANCED");
  }

  function navigate(route) { location.hash = "#/" + route; }

  function toast(msg) {
    let t = document.getElementById("appToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "appToast";
      t.style.cssText = "position:fixed;bottom:20px;right:24px;background:#152233;color:#fff;padding:10px 16px;border-radius:8px;font-size:12.5px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .3s;max-width:360px;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = "0"; }, 3400);
  }

  function showExplain(title, bodyHtml) {
    document.getElementById("explainTitle").textContent = title;
    document.getElementById("explainBody").innerHTML = bodyHtml;
    document.getElementById("explainModal").classList.remove("hidden");
  }

  function applyTheme() {
    const theme = STORE.get().theme || "LIGHT";
    document.documentElement.setAttribute("data-theme", theme === "DARK" ? "dark" : "light");
  }

  // "Live Demo" fetches real weather (Open-Meteo + NASA POWER) for Leh —
  // no illustrative/hand-authored climate data anywhere in the app.
  async function runLiveDemo() {
    const btn = document.getElementById("runLiveDemoBtn");
    if (btn) btn.disabled = true;
    toast("Fetching live weather for Leh, Ladakh…");
    try {
      await STORE.loadRealClimate("leh");
      const s = STORE.get();
      s.design = STORE.defaultDesign();
      STORE.save();
      const check = ENGINE.validateDesign(s.design);
      if (!check.valid) throw new Error("Default design failed validation: " + check.errors.join(" "));
      const season = STORE.currentSeason();
      const result = ENGINE.runSimulation(s.design, season, s.simConfig);
      STORE.recordSimulation(result);
      const opt = ENGINE.runOptimization(s.design, season, s.simConfig, s.weights);
      STORE.recordOptimization(opt);
      navigate("evaluator");
      const tierNote = s.climateSource && s.climateSource.tier !== "LIVE" ? ` (${s.climateSource.tier === "FRESH_CACHE" ? "served from cache" : "served from stale cache — network issue"})` : "";
      toast("Live demo complete: real climate → simulation → optimization." + tierNote);
    } catch (e) {
      toast("Could not complete the live demo: " + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function init() {
    document.getElementById("brandName").textContent = CFG.APP_NAME;
    document.title = CFG.APP_NAME + " — Passive Shelter Thermal Design Platform";
    applyTheme();

    // Last-resort safety net for errors outside the render cycle (async
    // handlers, timers) so nothing shows a silent blank page. Individual
    // actions still prefer their own try/catch with a specific message.
    window.addEventListener("error", (e) => { console.error("Uncaught error:", e.error || e.message); });
    window.addEventListener("unhandledrejection", (e) => { console.error("Unhandled promise rejection:", e.reason); });

    window.addEventListener("hashchange", render);
    document.getElementById("runLiveDemoBtn").addEventListener("click", runLiveDemo);

    // Mobile off-canvas sidebar (hamburger in the topbar, only visible <=860px).
    const sidebarEl = document.getElementById("sidebar");
    const backdropEl = document.getElementById("sidebarBackdrop");
    const closeSidebar = () => { sidebarEl.classList.remove("open"); backdropEl.classList.remove("open"); };
    document.getElementById("menuToggle").addEventListener("click", () => {
      sidebarEl.classList.toggle("open"); backdropEl.classList.toggle("open");
    });
    document.getElementById("sidebarClose").addEventListener("click", closeSidebar);
    backdropEl.addEventListener("click", closeSidebar);
    document.getElementById("mainNav").addEventListener("click", (e) => { if (e.target.tagName === "A") closeSidebar(); });
    document.getElementById("explainClose").addEventListener("click", () => document.getElementById("explainModal").classList.add("hidden"));
    document.getElementById("explainModal").addEventListener("click", (e) => { if (e.target.id === "explainModal") e.currentTarget.classList.add("hidden"); });

    document.getElementById("modeSimple").addEventListener("click", () => { STORE.get().mode = "SIMPLE"; STORE.save(); document.getElementById("modeSimple").classList.add("active"); document.getElementById("modeAdvanced").classList.remove("active"); render(); });
    document.getElementById("modeAdvanced").addEventListener("click", () => { STORE.get().mode = "ADVANCED"; STORE.save(); document.getElementById("modeAdvanced").classList.add("active"); document.getElementById("modeSimple").classList.remove("active"); render(); });

    if (STORE.get().mode === "ADVANCED") { document.getElementById("modeAdvanced").click(); }

    if (!location.hash) location.hash = "#/dashboard";
    render();
  }

  return { render, navigate, toast, showExplain, runLiveDemo, applyTheme, init };
})();

document.addEventListener("DOMContentLoaded", window.APP.init);
