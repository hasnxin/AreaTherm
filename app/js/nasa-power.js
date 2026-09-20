/* AreaTherm — NASA POWER climatology integration (solar + temperature).
   Complements weather-api.js: Open-Meteo drives the hourly RC simulation
   (a live 7-day forecast), while NASA POWER supplies the "annual solar
   potential" headline figure from a real 20-year (2001-2020) climate
   normal — no API key, CORS-enabled, client-side fetch. Neither source
   feeds the other; this module only supplies reference/display numbers,
   the thermal engine itself is untouched. Routed through
   app/js/reliability.js — see weather-api.js header for why. */

window.APP_NASA = (function () {
  const REL = window.APP_RELIABLE;
  const CACHE_PREFIX = "areatherm_nasa_v2_";
  const CACHE_TTL_MS = 5 * 24 * 3600 * 1000; // 5 days, per spec

  function cacheKey(lat, lon) {
    return CACHE_PREFIX + lat.toFixed(3) + "_" + lon.toFixed(3);
  }

  // NASA POWER encodes "no data for this point/month" as the sentinel -999
  // (a real, documented fill value), which is a finite number and would
  // otherwise pass straight through as if it were a genuine measurement —
  // e.g. showing up as an impossible "-999.0°C coldest month" and wrecking
  // a chart's y-axis scale. Treat anything at or below -900 as missing.
  function sane(v) {
    return (typeof v === "number" && Number.isFinite(v) && v > -900) ? v : null;
  }

  async function fetchRaw(lat, lon) {
    const url = "https://power.larc.nasa.gov/api/temporal/climatology/point" +
      "?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M" +
      `&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;

    const j = await REL.fetchJsonWithTimeout(url);
    if (!j.properties || !j.properties.parameter) throw new Error("Unexpected NASA POWER response shape.");

    const ghi = j.properties.parameter.ALLSKY_SFC_SW_DWN || {};
    const dni = j.properties.parameter.ALLSKY_SFC_SW_DNI || {};
    const dif = j.properties.parameter.ALLSKY_SFC_SW_DIFF || {};
    const temp = j.properties.parameter.T2M || {};
    const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    const ghiAnn = sane(ghi.ANN);
    return {
      ghiKwhM2DayAnnual: ghiAnn,
      dniKwhM2DayAnnual: sane(dni.ANN),
      difKwhM2DayAnnual: sane(dif.ANN),
      tempCAnnual: sane(temp.ANN),
      annualSolarKwhM2Yr: ghiAnn != null ? Math.round(ghiAnn * 365) : null,
      monthlyGhi: MONTHS.map(m => ({ month: m, kwhM2Day: sane(ghi[m]) })),
      monthlyDni: MONTHS.map(m => ({ month: m, kwhM2Day: sane(dni[m]) })),
      monthlyDif: MONTHS.map(m => ({ month: m, kwhM2Day: sane(dif[m]) })),
      monthlyTemp: MONTHS.map(m => ({ month: m, tempC: sane(temp[m]) })),
      climatologyRange: (j.header && j.header.range) || "2001-2020",
      fetchedAt: Date.now(),
      label: "NASA POWER", period: "20-yr climatology (2001-2020)"
    };
  }

  // Returns the shaped climatology object with `tier`/`ageMs` merged in.
  async function fetchClimatology(lat, lon, opts) {
    opts = opts || {};
    const result = await REL.reliableFetch(
      "NASA_POWER", cacheKey(lat, lon), CACHE_TTL_MS,
      () => fetchRaw(lat, lon),
      { forceRefresh: opts.forceRefresh, preferCache: true }
    );
    return Object.assign({}, result.data, { tier: result.tier, ageMs: result.ageMs, tierError: result.error });
  }

  return { fetchClimatology };
})();
