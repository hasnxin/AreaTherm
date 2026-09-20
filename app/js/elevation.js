/* AreaTherm — real elevation lookup (Open-Meteo Elevation API).
   No API key, CORS-enabled, backed by SRTM-derived global terrain data.
   Replaces trusting the static PREDEFINED_LOCATIONS elevation figure at
   display time: every location's elevation shown to the user is refined by
   a real query for its exact lat/lon (useful in particular once manual
   coordinate entry is used, where no catalog figure exists at all).

   This directly stands in for the checklist's "ISRO Bhuvan / NASA SRTM /
   OpenTopography elevation API" item: those specific services need a paid
   or registered API key which this environment cannot obtain on the user's
   behalf, so Open-Meteo's free, keyless elevation endpoint (also SRTM-based)
   is used instead to satisfy the same underlying requirement — real
   elevation, not a hardcoded figure. DEM-based horizon/terrain shading
   (relevant for narrow Himalayan valleys) is NOT implemented: it needs a
   raster DEM API this app has no key for, and is out of scope for this pass. */

window.APP_ELEVATION = (function () {
  const REL = window.APP_RELIABLE;
  const CACHE_PREFIX = "areatherm_elev_v1_";
  const CACHE_TTL_MS = Infinity; // elevation is static — cache indefinitely once fetched

  // Same precision as weather-api.js / nasa-power.js's cache keys (~111m
  // grid) — a coarser key here would let two distinct nearby custom sites
  // collide and silently share one site's elevation.
  function cacheKey(lat, lon) {
    return CACHE_PREFIX + lat.toFixed(3) + "_" + lon.toFixed(3);
  }

  // Returns { data: { elevationM, source }, tier: 'LIVE'|'FRESH_CACHE'|'STALE_CACHE' }
  async function fetchElevation(lat, lon) {
    const key = cacheKey(lat, lon);
    return REL.reliableFetch("ELEVATION", key, CACHE_TTL_MS, async () => {
      const url = "https://api.open-meteo.com/v1/elevation?latitude=" + lat + "&longitude=" + lon;
      const j = await REL.fetchJsonWithTimeout(url);
      if (!j.elevation || !j.elevation.length) throw new Error("Unexpected elevation API response shape.");
      return {
        elevationM: Math.round(j.elevation[0]),
        source: "Open-Meteo Elevation API (SRTM-derived, ~90m resolution)",
        fetchedAt: Date.now()
      };
    }, { preferCache: true });
  }

  return { fetchElevation };
})();
