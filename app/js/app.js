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
    "climate-card": window.UI.renderClimateCard,
    "material-comparison": window.UI.renderMaterialComparison,
    evaluator: window.UI.renderEvaluator,
    settings: window.UI.renderSettings
  };

  function currentRoute() {
    const hash = location.hash.replace("#/", "");
    return ROUTES[hash] ? hash : "dashboard";
  }

  function logError(context, err) {
    console.error("[AreaTherm]", new Date().toISOString(), context, err);
  }

  function updateOnlineStatus() {
    const badge = document.getElementById("offlineBadge");
    if (badge) badge.hidden = navigator.onLine;
  }

  // Global exception handler around every screen render: a bug in one
  // screen shows a clean recoverable message instead of a blank page or a
  // raw stack trace, and the real error still goes to the console for
  // debugging. This is the last line of defence — most user-triggered
  // actions (running a simulation, loading weather) validate their inputs
  // and catch their own errors first with a more specific message.
  function renderErrorCard(route, err) {
    logError("render:" + route, err);
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
    try {
      document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.dataset.route === route));
      document.getElementById("projectName").textContent = STORE.get().project.name;
      ROUTES[route](viewRoot());
      document.body.classList.toggle("mode-advanced", STORE.get().mode === "ADVANCED");
      updateOnlineStatus(); // self-corrects the offline badge on every navigation, not just at startup
    } catch (e) {
      renderErrorCard(route, e);
    }
  }

  function navigate(route) { location.hash = "#/" + route; }

  // opts: { duration (ms), actionLabel, onAction }
  function toast(msg, opts) {
    opts = opts || {};
    let t = document.getElementById("appToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "appToast";
      t.style.cssText = "position:fixed;bottom:20px;right:24px;background:var(--tooltip-bg);color:#fff;padding:10px 16px;border-radius:var(--radius-card);font-size:12.5px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .3s;display:flex;align-items:center;gap:12px;max-width:360px;";
      document.body.appendChild(t);
    }
    t.innerHTML = "";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = msg;
    t.appendChild(msgSpan);
    if (opts.actionLabel && opts.onAction) {
      const btn = document.createElement("button");
      btn.textContent = opts.actionLabel;
      btn.style.cssText = "background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:var(--radius-btn);padding:4px 10px;font-size:11.5px;font-weight:600;cursor:pointer;flex:none;";
      btn.addEventListener("click", opts.onAction);
      t.appendChild(btn);
    }
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = "0"; }, opts.duration || 3400);
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
    if (btn) { btn.disabled = true; btn.classList.add("is-loading"); }
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
      logError("runLiveDemo", e);
      toast("Could not complete the live demo: " + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove("is-loading"); }
    }
  }

  function init() {
   try {
    document.getElementById("brandName").textContent = CFG.APP_NAME;
    document.title = CFG.APP_NAME + " — Passive Shelter Thermal Design Platform";
    applyTheme();

    // App-wide safety net: any exception or rejected promise not already
    // caught locally lands here instead of silently breaking the page.
    window.addEventListener("error", (e) => {
      logError("window.onerror", e.error || e.message);
      toast("Something went wrong. Your project data is safe.", {
        duration: 5000, actionLabel: "Reload", onAction: () => location.reload()
      });
    });
    window.addEventListener("unhandledrejection", (e) => {
      logError("unhandledrejection", e.reason);
      toast("An operation failed unexpectedly. Your project data is safe.", {
        duration: 5000, actionLabel: "Reload", onAction: () => location.reload()
      });
    });

    window.addEventListener("hashchange", render);
    document.getElementById("runLiveDemoBtn").addEventListener("click", runLiveDemo);

    // App-shell offline support: caches only this app's own HTML/CSS/JS,
    // never climate data (see sw.js header comment). Registration failure
    // (e.g. file:// origin, unsupported browser) is silently non-fatal —
    // the app works online-only in that case, same as before.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) => logError("sw-register", e));
    }
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
    // navigator.onLine can read stale/false for a brief instant during page
    // startup in some sandboxed/embedded browser contexts, with no "online"
    // event ever following (the browser never considered itself to have
    // changed state) — a short delayed re-check clears a bogus offline
    // badge instead of leaving it wrong until the next navigation.
    setTimeout(updateOnlineStatus, 1500);

    // The hamburger in the topbar drives two different, non-overlapping
    // behaviors from the one button, switched purely by CSS media query
    // (see styles.css) rather than a window-width check here: <=860px it
    // opens/closes an off-canvas drawer (starts hidden); >860px it
    // collapses the normally-always-visible sidebar in place, for more
    // content width on a desktop window. The desktop collapse preference
    // persists across reloads, same as theme/units.
    const appShellEl = document.querySelector(".app-shell");
    const sidebarEl = document.getElementById("sidebar");
    const backdropEl = document.getElementById("sidebarBackdrop");
    const closeSidebar = () => { sidebarEl.classList.remove("open"); backdropEl.classList.remove("open"); };
    const SIDEBAR_COLLAPSED_KEY = "areatherm_sidebar_collapsed";
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") appShellEl.classList.add("sidebar-collapsed");
    } catch (e) { /* storage unavailable — default expanded */ }
    document.getElementById("menuToggle").addEventListener("click", () => {
      sidebarEl.classList.toggle("open"); backdropEl.classList.toggle("open");
      const collapsed = appShellEl.classList.toggle("sidebar-collapsed");
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0"); } catch (e) { /* storage unavailable */ }
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
   } catch (e) {
    logError("init", e);
    document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;max-width:560px;">
      <h2>AreaTherm couldn't start</h2>
      <p>Something went wrong during startup. Your saved project data is untouched.</p>
      <button onclick="location.reload()" style="padding:8px 16px;">Reload</button>
    </div>`;
   }
  }

  return { render, navigate, toast, showExplain, runLiveDemo, init, logError, applyTheme };
})();

document.addEventListener("DOMContentLoaded", window.APP.init);
