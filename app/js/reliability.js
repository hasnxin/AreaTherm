/* AreaTherm — reliability layer for every external API call.
   A single place implementing: request timeouts, capped exponential-backoff
   retries, a per-source circuit breaker, and a tiered cache-fallback chain
   (live -> fresh cache -> stale cache -> clear error). Used by
   weather-api.js, nasa-power.js, and elevation.js so a slow or unreachable
   network degrades gracefully instead of freezing the UI or crashing the
   live demo. The cache itself lives in IndexedDB (see idb.js) rather than
   localStorage, so this module's only other dependency beyond
   APP_CONFIG.RELIABILITY is window.APP_IDB. */

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
  // fetchOpts (optional): {method, headers, body} merged into the fetch()
  // call — defaults to a plain GET, so the three existing callers (each
  // passing only `url`) are unaffected. On a non-2xx response, the parsed
  // JSON body (if any) is attached to the thrown Error as `.body`, and its
  // `status` as `.status`, so callers needing the real status/error payload
  // (e.g. a 401 handler, or surfacing a backend's {message} field) don't
  // have to re-parse the response themselves.
  async function fetchJsonWithTimeout(url, timeoutMs, fetchOpts) {
    const ms = timeoutMs || CFG.TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    let resp;
    try {
      resp = await fetch(url, Object.assign({ signal: controller.signal }, fetchOpts));
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error("Request timed out after " + (ms / 1000) + "s");
      // A raw fetch() failure (offline, DNS, CORS, connection refused) throws
      // a generic/browser-specific TypeError ("Failed to fetch") — surface a
      // clear, actionable message instead of that raw string.
      throw new Error("Network error — check your internet connection.");
    }
    clearTimeout(timer);
    if (!resp.ok) {
      let body = null;
      try { body = await resp.json(); } catch (e) { /* no/non-JSON body */ }
      const err = new Error((body && body.message) || ("HTTP " + resp.status));
      err.status = resp.status;
      err.body = body;
      throw err;
    }
    if (resp.status === 204) return null; // No Content — no body to parse
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

  // ---- Tiered cache (IndexedDB, via idb.js). Never deleted on expiry so a
  // stale value can still serve as a last-resort fallback tier — every
  // unique location ever looked up (weather/NASA POWER/elevation, each
  // keyed by lat/lon) accumulates here forever, so without the eviction
  // below it's an unbounded, slowly-growing consumer of storage. IndexedDB
  // gives this far more headroom than localStorage (hundreds of MB to
  // low-GB instead of ~5-10MB) — the eviction stays as defense-in-depth,
  // not as the primary defense against filling browser storage.
  const IDB_STORE = "apiCache";
  async function cacheRead(key) {
    return window.APP_IDB.get(IDB_STORE, key); // already {data, fetchedAt}-shaped, or null
  }

  // Every entry this module ever writes has this exact {data, fetchedAt}
  // shape, so the oldest ones can be found by shape alone.
  async function scanCacheEntries() {
    const entries = await window.APP_IDB.getAllEntries(IDB_STORE);
    return entries
      .filter(e => e.value && typeof e.value === "object" && typeof e.value.fetchedAt === "number")
      .map(e => ({ key: e.key, fetchedAt: e.value.fetchedAt }));
  }
  async function evictOldestCacheEntries(count) {
    const victims = (await scanCacheEntries()).sort((a, b) => a.fetchedAt - b.fetchedAt).slice(0, count);
    await Promise.all(victims.map(e => window.APP_IDB.del(IDB_STORE, e.key)));
    return victims.length;
  }
  async function clearAllCache() {
    const entries = await scanCacheEntries();
    await window.APP_IDB.clearStore(IDB_STORE);
    return entries.length;
  }

  async function cacheWrite(key, data) {
    const payload = { data, fetchedAt: Date.now() };
    try {
      await window.APP_IDB.set(IDB_STORE, key, payload);
    } catch (e) {
      // Quota exceeded (rare with IndexedDB's much larger headroom, but not
      // impossible — private mode/disabled storage would also land here,
      // and the retry below is a harmless no-op for those). These entries
      // are disposable and re-fetchable, unlike the user's actual design/
      // project data, so it's safe to make room by evicting the oldest of
      // them rather than just losing this write silently.
      await evictOldestCacheEntries(10);
      try { await window.APP_IDB.set(IDB_STORE, key, payload); } catch (e2) { /* still unavailable */ }
    }
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
    const cached = await cacheRead(cacheKey);
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

  return { fetchJsonWithTimeout, withRetry, reliableFetch, breakerStatus, cacheRead, cacheWrite, evictOldestCacheEntries, clearAllCache };
})();
