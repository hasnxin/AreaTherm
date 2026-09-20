/* AreaTherm — reliability layer for every external API call.
   A single place implementing: request timeouts, capped exponential-backoff
   retries, a per-source circuit breaker, and a tiered cache-fallback chain
   (live -> fresh cache -> stale cache -> clear error). Used by
   weather-api.js, nasa-power.js, and elevation.js so a slow or unreachable
   network degrades gracefully instead of freezing the UI or crashing the
   live demo. Pure/no DOM, so it also has no dependency on the rest of the
   app beyond APP_CONFIG.RELIABILITY. */

window.APP_RELIABLE = (function () {
  const CFG = (window.APP_CONFIG && window.APP_CONFIG.RELIABILITY) || {
    TIMEOUT_MS: 7000, MAX_RETRIES: 2, RETRY_BASE_DELAY_MS: 500,
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: 3, CIRCUIT_BREAKER_COOLDOWN_MS: 60000
  };

  // ---- Circuit breaker, one per named source (e.g. "OPEN_METEO") ---------
  const breakers = {};
  function getBreaker(name) {
    if (!breakers[name]) breakers[name] = { failures: 0, openUntil: 0 };
    return breakers[name];
  }
  function circuitOpen(name) {
    return Date.now() < getBreaker(name).openUntil;
  }
  function recordSuccess(name) {
    const b = getBreaker(name);
    b.failures = 0;
    b.openUntil = 0;
  }
  function recordFailure(name) {
    const b = getBreaker(name);
    b.failures++;
    if (b.failures >= CFG.CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      b.openUntil = Date.now() + CFG.CIRCUIT_BREAKER_COOLDOWN_MS;
    }
  }
  function breakerStatus(name) {
    const b = getBreaker(name);
    return { failures: b.failures, open: Date.now() < b.openUntil, openUntil: b.openUntil };
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // ---- Fetch with an actual request timeout (AbortController) ------------
  async function fetchJsonWithTimeout(url, timeoutMs) {
    const ms = timeoutMs || CFG.TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    let resp;
    try {
      resp = await fetch(url, { signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error("Request timed out after " + (ms / 1000) + "s");
      // A raw fetch() failure (offline, DNS, CORS, connection refused) throws
      // a generic/browser-specific TypeError ("Failed to fetch") — surface a
      // clear, actionable message instead of that raw string.
      throw new Error("Network error — check your internet connection.");
    }
    clearTimeout(timer);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return await resp.json();
  }

  // ---- Retry with capped exponential backoff ------------------------------
  async function withRetry(fn, opts) {
    opts = opts || {};
    const maxRetries = opts.maxRetries != null ? opts.maxRetries : CFG.MAX_RETRIES;
    const baseDelay = opts.baseDelayMs != null ? opts.baseDelayMs : CFG.RETRY_BASE_DELAY_MS;
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (attempt < maxRetries) await sleep(baseDelay * Math.pow(2, attempt));
      }
    }
    throw lastErr;
  }

  // ---- Tiered cache (localStorage). Never deleted on expiry so a stale
  // value can still serve as a last-resort fallback tier. -----------------
  function cacheRead(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function cacheWrite(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ data, fetchedAt: Date.now() })); } catch (e) { /* storage unavailable (private mode, quota) */ }
  }

  // ---- Fallback chain: live -> fresh cache -> stale cache -> clear error -
  // sourceName: circuit-breaker label, e.g. "OPEN_METEO" / "NASA_POWER" / "ELEVATION"
  // cacheKey:   localStorage key for this specific query (e.g. per lat/lon)
  // ttlMs:      freshness window; a cache hit older than this is still used
  //             as a last resort but tagged STALE_CACHE, never silently
  //             shown as live.
  // fetchFn:    () => Promise<shaped data> — the actual network call; no
  //             caching logic inside it, reliableFetch owns that.
  // opts.forceRefresh: skip the "reuse fresh cache without hitting the network" shortcut.
  // opts.preferCache (default true): if a fresh cache entry exists, return it
  //             without calling the network at all (avoids redundant calls
  //             for a location already loaded this session).
  // Returns { data, tier: 'LIVE'|'FRESH_CACHE'|'STALE_CACHE', ageMs, error? }
  async function reliableFetch(sourceName, cacheKey, ttlMs, fetchFn, opts) {
    opts = opts || {};
    const preferCache = opts.preferCache !== false;
    const cached = cacheRead(cacheKey);
    const ageMs = cached ? Date.now() - cached.fetchedAt : null;
    const isFresh = !!cached && ageMs <= ttlMs;

    if (!opts.forceRefresh && preferCache && isFresh) {
      return { data: cached.data, tier: "FRESH_CACHE", ageMs };
    }

    if (circuitOpen(sourceName)) {
      if (cached) {
        return { data: cached.data, tier: isFresh ? "FRESH_CACHE" : "STALE_CACHE", ageMs, circuitOpen: true };
      }
      throw new Error(sourceName + " is temporarily unavailable after repeated failures. It will retry automatically in about a minute — no cached data exists yet for this location.");
    }

    try {
      const data = await withRetry(fetchFn, opts);
      recordSuccess(sourceName);
      cacheWrite(cacheKey, data);
      return { data, tier: "LIVE", ageMs: 0 };
    } catch (e) {
      recordFailure(sourceName);
      if (cached) {
        return { data: cached.data, tier: isFresh ? "FRESH_CACHE" : "STALE_CACHE", ageMs, error: e.message };
      }
      throw e;
    }
  }

  return { fetchJsonWithTimeout, withRetry, reliableFetch, breakerStatus, cacheRead, cacheWrite };
})();
