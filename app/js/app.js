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

  function render() {
    const route = currentRoute();
    try {
      document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.dataset.route === route));
      document.getElementById("projectName").textContent = STORE.get().project.name;
      ROUTES[route](viewRoot());
      document.body.classList.toggle("mode-advanced", STORE.get().mode === "ADVANCED");
      updateOnlineStatus(); // self-corrects the offline badge on every navigation, not just at startup
    } catch (e) {
      logError("render:" + route, e);
      viewRoot().innerHTML = `
        <div class="card" style="max-width:520px;">
          <h3>This screen couldn't be displayed</h3>
          <p class="subtitle">Something went wrong rendering "${route}". Your project data is safe.</p>
          <button class="btn btn-accent" id="errRecoverBtn">Go to Dashboard</button>
        </div>`;
      const btn = document.getElementById("errRecoverBtn");
      if (btn) btn.addEventListener("click", () => navigate("dashboard"));
    }
  }

  function navigate(route) { location.hash = "#/" + route; }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", STORE.get().theme === "dark" ? "dark" : "light");
  }

  // opts: { duration (ms), actionLabel, onAction }
  function toast(msg, opts) {
    opts = opts || {};
    let t = document.getElementById("appToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "appToast";
      t.style.cssText = "position:fixed;bottom:20px;right:24px;background:#152233;color:#fff;padding:10px 16px;border-radius:8px;font-size:12.5px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .3s;display:flex;align-items:center;gap:12px;";
      document.body.appendChild(t);
    }
    t.innerHTML = "";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = msg;
    t.appendChild(msgSpan);
    if (opts.actionLabel && opts.onAction) {
      const btn = document.createElement("button");
      btn.textContent = opts.actionLabel;
      btn.style.cssText = "background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:5px;padding:4px 10px;font-size:11.5px;font-weight:600;cursor:pointer;flex:none;";
      btn.addEventListener("click", opts.onAction);
      t.appendChild(btn);
    }
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = "0"; }, opts.duration || 2600);
  }

  function showExplain(title, bodyHtml) {
    document.getElementById("explainTitle").textContent = title;
    document.getElementById("explainBody").innerHTML = bodyHtml;
    document.getElementById("explainModal").classList.remove("hidden");
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
      const season = STORE.currentSeason();
      const result = ENGINE.runSimulation(s.design, season, s.simConfig);
      STORE.recordSimulation(result);
      const opt = ENGINE.runOptimization(s.design, season, s.simConfig, s.weights);
      STORE.recordOptimization(opt);
      navigate("evaluator");
      toast("Live demo complete: real climate → simulation → optimization.");
    } catch (e) {
      logError("runLiveDemo", e);
      toast("Could not fetch live weather: " + e.message);
    } finally {
      if (btn) btn.disabled = false;
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
