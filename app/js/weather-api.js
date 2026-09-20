/* AreaTherm — live weather integration (Open-Meteo, no API key required).
   Client-side only: Open-Meteo's forecast endpoint is CORS-enabled for
   direct browser calls, so no backend proxy is needed. Routed through
   app/js/reliability.js for request timeouts, retries, a circuit breaker,
   and a tiered live/fresh-cache/stale-cache fallback chain (mirrors a
   server-side @Cacheable + resilience layer in the target Spring Boot
   architecture — see ARCHITECTURE.md SS1). Cached 7 days. */

window.APP_WEATHER = (function () {
  const REL = window.APP_RELIABLE;
  const CACHE_PREFIX = "areatherm_wx_v2_";
  const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
  const FORECAST_DAYS = 7;

  function cacheKey(lat, lon) {
    return CACHE_PREFIX + lat.toFixed(3) + "_" + lon.toFixed(3);
  }

  function toDecimalHour(isoTimeStr) {
    const t = isoTimeStr.split("T")[1];
    const [h, m] = t.split(":").map(Number);
    return h + m / 60;
  }
  function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
  function sum(arr) { return arr.reduce((s, v) => s + v, 0); }

  // Builds a 24-point "typical day" hourly profile by averaging the
  // forecast's hourly values bucketed by hour-of-day across FORECAST_DAYS —
  // smooths out any single unusually cloudy/windy day in the window.
  function buildTypicalDay(hourlyTimes, tempArr, solarArr, windKmhArr, rhArr, cloudArr, precipArr) {
    const buckets = Array.from({ length: 24 }, () => ({ temp: [], solar: [], wind: [], rh: [], cloud: [], precip: [] }));
    hourlyTimes.forEach((t, i) => {
      const h = Math.floor(toDecimalHour(t));
      buckets[h].temp.push(tempArr[i]);
      buckets[h].solar.push(solarArr[i]);
      buckets[h].wind.push(windKmhArr[i] / 3.6);
      buckets[h].rh.push(rhArr[i]);
      buckets[h].cloud.push(cloudArr[i]);
      buckets[h].precip.push(precipArr ? (precipArr[i] || 0) : 0);
    });
    return buckets.map((b, h) => ({
      hourDecimal: h,
      temp: Math.round(avg(b.temp) * 10) / 10,
      solar: Math.max(0, Math.round(avg(b.solar))),
      windMs: Math.round(avg(b.wind) * 10) / 10,
      rhPct: Math.round(avg(b.rh)),
      cloudPct: Math.round(avg(b.cloud)),
      precipMm: Math.round(avg(b.precip) * 100) / 100
    }));
  }

  async function fetchRaw(lat, lon) {
    const url = "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${lat}&longitude=${lon}` +
      "&daily=temperature_2m_max,temperature_2m_min,shortwave_radiation_sum,wind_speed_10m_max,precipitation_sum,sunrise,sunset" +
      "&hourly=temperature_2m,shortwave_radiation,wind_speed_10m,relative_humidity_2m,cloud_cover,precipitation" +
      `&timezone=auto&forecast_days=${FORECAST_DAYS}`;

    const j = await REL.fetchJsonWithTimeout(url);
    if (!j.hourly || !j.daily) throw new Error("Unexpected Open-Meteo response shape.");

    const hourly = buildTypicalDay(
      j.hourly.time, j.hourly.temperature_2m, j.hourly.shortwave_radiation,
      j.hourly.wind_speed_10m, j.hourly.relative_humidity_2m, j.hourly.cloud_cover, j.hourly.precipitation
    );

    const tMin = Math.round(avg(j.daily.temperature_2m_min) * 10) / 10;
    const tMax = Math.round(avg(j.daily.temperature_2m_max) * 10) / 10;
    const solarKwhDay = Math.round((avg(j.daily.shortwave_radiation_sum) / 3.6) * 100) / 100; // MJ/m2 -> kWh/m2
    const sunrise = Math.round(avg(j.daily.sunrise.map(toDecimalHour)) * 100) / 100;
    const sunset = Math.round(avg(j.daily.sunset.map(toDecimalHour)) * 100) / 100;
    const windMs = Math.round((avg(j.daily.wind_speed_10m_max) / 3.6) * 10) / 10;
    const rhPct = Math.round(avg(hourly.map(h => h.rhPct)));
    const cloudPct = Math.round(avg(hourly.map(h => h.cloudPct)));
    const precipMmDayAvg = Math.round((sum(j.daily.precipitation_sum) / FORECAST_DAYS) * 100) / 100;

    return {
      tMin, tMax, solarKwhDay, sunrise, sunset, windMs, rhPct, cloudPct, precipMmDayAvg, hourly,
      elevationM: j.elevation,
      timezone: j.timezone,
      fetchedAt: Date.now(),
      period: FORECAST_DAYS + "-day forecast average"
    };
  }

  // Returns the shaped weather object with `tier` ('LIVE'|'FRESH_CACHE'|
  // 'STALE_CACHE') and `ageMs` merged in, so callers can label the
  // data-source badge honestly instead of always claiming "live".
  async function fetchOpenMeteo(lat, lon, opts) {
    opts = opts || {};
    const result = await REL.reliableFetch(
      "OPEN_METEO", cacheKey(lat, lon), CACHE_TTL_MS,
      () => fetchRaw(lat, lon),
      { forceRefresh: opts.forceRefresh, preferCache: true }
    );
    return Object.assign({}, result.data, { tier: result.tier, ageMs: result.ageMs, tierError: result.error });
  }

  return { fetchOpenMeteo };
})();
