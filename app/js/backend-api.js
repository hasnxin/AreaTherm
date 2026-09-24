/* AreaTherm — client for the Spring Boot backend (see /backend). The app
   requires this backend to be running (base URL: APP_CONFIG.BACKEND.BASE_URL).
   Thin per-resource wrapper functions, same shape as weather-api.js/
   nasa-power.js, built on REL.fetchJsonWithTimeout directly (not the
   cache-oriented REL.reliableFetch — these are mostly mutating calls).

   Auth/session state is stored separately from APP_STORE's own state (a
   login session isn't app data — it must survive "Reset Project" and isn't
   part of the schema-mirrored STORE shape). */

window.APP_BACKEND = (function () {
  const REL = window.APP_RELIABLE;
  const CFG = (window.APP_CONFIG && window.APP_CONFIG.BACKEND) || {
    BASE_URL: "http://localhost:8080/api/v1", POLL_INTERVAL_MS: 1500, POLL_TIMEOUT_MS: 120000
  };
  const AUTH_KEY = "areatherm_auth_v1";

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // ---- Auth/session storage ------------------------------------------------
  // {token, tokenType, expiresAt, userId, role, email}, or null if logged out.
  function getAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function isAuthValid() {
    const a = getAuth();
    return !!a && !!a.token && a.expiresAt > Date.now();
  }
  function clearAuth() {
    try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
  }
  // Decodes a JWT's own payload segment (base64url) — used to recover
  // userId/role without a dedicated /auth/me endpoint (the backend doesn't
  // have one; the login/register response doesn't carry these either).
  function decodeJwtPayload(token) {
    try {
      const seg = token.split(".")[1];
      const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(atob(b64).split("").map(c =>
        "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
      return JSON.parse(json);
    } catch (e) { return {}; }
  }
  function setAuth(authResponse, email) {
    const claims = decodeJwtPayload(authResponse.token);
    const auth = {
      token: authResponse.token,
      tokenType: authResponse.tokenType || "Bearer",
      expiresAt: Date.now() + (authResponse.expiresInMinutes || 120) * 60000,
      userId: claims.userId != null ? claims.userId : null,
      role: claims.role || null,
      email: email
    };
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch (e) { /* ignore */ }
    return auth;
  }
  function logout() { clearAuth(); }

  // ---- Core request helper ---------------------------------------------
  // On a 401 (expired/invalid token — there is no refresh mechanism), clears
  // the stored session and forces the user back to the login screen; every
  // caller still sees the thrown error too, in case it wants its own message.
  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const auth = getAuth();
    if (auth && auth.token) headers.Authorization = (auth.tokenType || "Bearer") + " " + auth.token;
    const opts = { method: method, headers: headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
      return await REL.fetchJsonWithTimeout(CFG.BASE_URL + path, null, opts);
    } catch (e) {
      if (e.status === 401 && path !== "/auth/login" && path !== "/auth/register") {
        clearAuth();
        if (location.hash !== "#/login") location.hash = "#/login";
      }
      throw e;
    }
  }
  function get(path) { return request("GET", path); }
  function post(path, body) { return request("POST", path, body); }
  function put(path, body) { return request("PUT", path, body); }
  function del(path) { return request("DELETE", path); }

  // ---- Async job polling (simulations, optimization runs) ----------------
  // getStatusFn: () => Promise<{status, ...}> — polled until COMPLETE/FAILED.
  async function pollUntilTerminal(getStatusFn, opts) {
    opts = opts || {};
    const intervalMs = opts.intervalMs || CFG.POLL_INTERVAL_MS;
    const timeoutMs = opts.timeoutMs || CFG.POLL_TIMEOUT_MS;
    const start = Date.now();
    for (;;) {
      const result = await getStatusFn();
      if (result.status === "COMPLETE" || result.status === "FAILED") return result;
      if (Date.now() - start > timeoutMs) {
        throw new Error("Timed out waiting for the server to finish (over " + Math.round(timeoutMs / 1000) + "s). It may still complete in the background.");
      }
      await sleep(intervalMs);
    }
  }

  // ---- Auth ----------------------------------------------------------------
  function register(payload) { return post("/auth/register", payload); }
  async function login(email, password) {
    const res = await post("/auth/login", { email: email, password: password });
    return setAuth(res, email);
  }
  // Verifying a registration code logs you in too — the backend returns the
  // same {token,tokenType,expiresInMinutes} shape /login does.
  async function verifyEmail(email, code) {
    const res = await post("/auth/verify-email", { email: email, code: code });
    return setAuth(res, email);
  }
  function resendVerification(email) { return post("/auth/resend-verification", { email: email }); }

  // ---- Projects --------------------------------------------------------
  function listProjects() { return get("/projects"); }
  function getProject(id) { return get("/projects/" + id); }
  function createProject(payload) { return post("/projects", payload); }
  function deleteProject(id) { return del("/projects/" + id); }

  // ---- Locations & climate -----------------------------------------------
  function listLocations(projectId) { return get("/locations?projectId=" + encodeURIComponent(projectId)); }
  function createLocation(payload) { return post("/locations", payload); }
  function listClimateProfilesForLocation(locationId) { return get("/locations/" + locationId + "/climate-profiles"); }
  function createClimateProfile(payload) { return post("/climate-profiles", payload); }

  // ---- Materials -------------------------------------------------------
  function listMaterials(category) {
    return get("/materials" + (category ? "?category=" + encodeURIComponent(category) : ""));
  }
  function createMaterial(payload) { return post("/materials", payload); }

  // ---- Comfort profiles --------------------------------------------------
  function listComfortProfiles(projectId) { return get("/comfort-profiles?projectId=" + encodeURIComponent(projectId)); }
  function createComfortProfile(payload) { return post("/comfort-profiles", payload); }

  // ---- Shelter designs -----------------------------------------------------
  function listShelterDesigns(projectId) { return get("/projects/" + projectId + "/shelter-designs"); }
  function createShelterDesign(projectId, payload) { return post("/projects/" + projectId + "/shelter-designs", payload); }
  function updateShelterDesign(id, payload) { return put("/shelter-designs/" + id, payload); }
  function getShelterDesign(id) { return get("/shelter-designs/" + id); }

  // ---- Simulations -------------------------------------------------------
  function createSimulation(payload) { return post("/simulations", payload); }
  function getSimulation(id) { return get("/simulations/" + id); }
  function pollSimulation(id, opts) { return pollUntilTerminal(() => getSimulation(id), opts); }
  // Pages through the whole series (the backend paginates; the old
  // client-side engine returned it as one inline array) and returns the
  // concatenated raw page items — field renaming to the legacy shape is
  // adapter.js's job, not this module's.
  async function getFullSimulationSeries(id) {
    const items = [];
    let page = 0;
    for (;;) {
      const pageJson = await get("/simulations/" + id + "/series?page=" + page + "&size=500");
      const content = pageJson.content || [];
      items.push.apply(items, content);
      const isLast = typeof pageJson.last === "boolean" ? pageJson.last
        : (pageJson.page && typeof pageJson.page.totalPages === "number" ? page >= pageJson.page.totalPages - 1
          : content.length === 0);
      if (isLast || content.length === 0) break;
      page++;
    }
    return items;
  }

  // ---- ERA5 (optional, opt-in real reanalysis data) -----------------------
  function era5Availability() { return get("/climate/era5-fetch/availability"); }
  function createEra5Fetch(payload) { return post("/climate/era5-fetch", payload); }
  function getEra5Fetch(id) { return get("/climate/era5-fetch/" + id); }
  function pollEra5Fetch(id, opts) { return pollUntilTerminal(() => getEra5Fetch(id), opts); }

  // ---- Optimization runs ------------------------------------------------
  function createOptimizationRun(payload) { return post("/optimization-runs", payload); }
  function getOptimizationRun(id) { return get("/optimization-runs/" + id); }
  function pollOptimizationRun(id, opts) { return pollUntilTerminal(() => getOptimizationRun(id), opts); }

  // ---- Reports -----------------------------------------------------------
  function createReport(payload) { return post("/reports", payload); }
  function getReport(id) { return get("/reports/" + id); }
  // Binary download — bypasses fetchJsonWithTimeout (which always parses
  // JSON) and triggers a normal browser file-save via a temporary link.
  async function downloadReportFile(id, filename) {
    const auth = getAuth();
    const headers = {};
    if (auth && auth.token) headers.Authorization = (auth.tokenType || "Bearer") + " " + auth.token;
    const resp = await fetch(CFG.BASE_URL + "/reports/" + id + "/file", { headers: headers });
    if (!resp.ok) throw new Error("Could not download the report (HTTP " + resp.status + ").");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || ("areatherm-report-" + id + ".pdf");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    isAuthValid, getAuth, clearAuth, logout, register, login, verifyEmail, resendVerification,
    listProjects, getProject, createProject, deleteProject,
    listLocations, createLocation, listClimateProfilesForLocation, createClimateProfile,
    listMaterials, createMaterial,
    listComfortProfiles, createComfortProfile,
    listShelterDesigns, createShelterDesign, updateShelterDesign, getShelterDesign,
    createSimulation, getSimulation, pollSimulation, getFullSimulationSeries,
    createOptimizationRun, getOptimizationRun, pollOptimizationRun,
    createReport, getReport, downloadReportFile,
    era5Availability, createEra5Fetch, getEra5Fetch, pollEra5Fetch,
    pollUntilTerminal
  };
})();
