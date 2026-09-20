/* AreaTherm — NASA POWER climatology integration (solar + temperature).
   Complements weather-api.js: Open-Meteo drives the hourly RC simulation
   (a live 7-day forecast), while NASA POWER supplies the "annual solar
   potential" headline figure from a real 20-year (2001-2020) climate
   normal — no API key, CORS-enabled, client-side fetch. Neither source
   feeds the other; this module only supplies reference/display numbers,
   the thermal engine itself is untouched. */

window.APP_NASA = (function () {
  const CACHE_PREFIX = "areatherm_nasa_v1_";
  const CACHE_TTL_MS = 5 * 24 * 3600 * 1000; // 5 days, per spec

  function cacheKey(lat, lon) {
    return CACHE_PREFIX + lat.toFixed(3) + "_" + lon.toFixed(3);
  }
  function readCache(lat, lon) {
    try {
      const raw = localStorage.getItem(cacheKey(lat, lon));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.fetchedAt > CACHE_TTL_MS) return null;
      return obj;
    } catch (e) { return null; }
  }
  // Ignores TTL — last-resort fallback when every live attempt has failed.
  function readStaleCache(lat, lon) {
    try {
      const raw = localStorage.getItem(cacheKey(lat, lon));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeCache(lat, lon, data) {
    try { localStorage.setItem(cacheKey(lat, lon), JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }

  // Fetches the 20-year (2001-2020) monthly + annual climate normal for
  // solar irradiance (GHI, DNI) and 2m air temperature at (lat, lon).
  async function fetchClimatology(lat, lon, opts) {
    opts = opts || {};
    if (!opts.forceRefresh) {
      const c = readCache(lat, lon);
      if (c) return c;
    }
    const url = "https://power.larc.nasa.gov/api/temporal/climatology/point" +
      "?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,T2M" +
      `&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;

    let j;
    try {
      j = await window.U.fetchJsonWithRetry(url, {
        timeoutMs: 5000, retries: 2,
        onRetry: () => { if (window.APP && window.APP.toast) window.APP.toast("Connection slow… retrying NASA POWER…"); }
      });
    } catch (e) {
      const stale = readStaleCache(lat, lon);
      if (stale) {
        if (window.APP && window.APP.toast) window.APP.toast("Connection slow — using cached solar data.");
        return { ...stale, stale: true };
      }
      throw new Error("Could not reach NASA POWER after retrying — check your internet connection.");
    }
    if (!j.properties || !j.properties.parameter) throw new Error("Unexpected NASA POWER response shape.");

    const ghi = j.properties.parameter.ALLSKY_SFC_SW_DWN || {};
    const dni = j.properties.parameter.ALLSKY_SFC_SW_DNI || {};
    const temp = j.properties.parameter.T2M || {};
    const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

    const result = {
      ghiKwhM2DayAnnual: ghi.ANN,
      dniKwhM2DayAnnual: dni.ANN,
      tempCAnnual: temp.ANN,
      annualSolarKwhM2Yr: Math.round(ghi.ANN * 365),
      monthlyGhi: MONTHS.map(m => ({ month: m, kwhM2Day: ghi[m] })),
      monthlyTemp: MONTHS.map(m => ({ month: m, tempC: temp[m] })),
      climatologyRange: (j.header && j.header.range) || "2001-2020",
      fetchedAt: Date.now(),
      label: "NASA POWER", period: "20-yr climatology (2001-2020)"
    };
    writeCache(lat, lon, result);
    return result;
  }

  return { fetchClimatology };
})();
