/* AreaTherm — live weather integration (Open-Meteo, no API key required).
   Client-side only: Open-Meteo's forecast endpoint is CORS-enabled for
   direct browser calls, so no backend proxy is needed. Results are cached
   in localStorage for 7 days (mirrors a server-side @Cacheable in the
   target Spring Boot architecture — see ARCHITECTURE.md §1). */

window.APP_WEATHER = (function () {
  const CACHE_PREFIX = "areatherm_wx_v1_";
  const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
  const FORECAST_DAYS = 7;

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

  function toDecimalHour(isoTimeStr) {
    const t = isoTimeStr.split("T")[1];
    const [h, m] = t.split(":").map(Number);
    return h + m / 60;
  }
  function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

  // Builds a 24-point "typical day" hourly profile by averaging the
  // forecast's hourly values bucketed by hour-of-day across FORECAST_DAYS —
  // smooths out any single unusually cloudy/windy day in the window.
  function buildTypicalDay(hourlyTimes, tempArr, solarArr, windKmhArr, rhArr, cloudArr) {
    const buckets = Array.from({ length: 24 }, () => ({ temp: [], solar: [], wind: [], rh: [], cloud: [] }));
    hourlyTimes.forEach((t, i) => {
      const h = Math.floor(toDecimalHour(t));
      buckets[h].temp.push(tempArr[i]);
      buckets[h].solar.push(solarArr[i]);
      buckets[h].wind.push(windKmhArr[i] / 3.6);
      buckets[h].rh.push(rhArr[i]);
      buckets[h].cloud.push(cloudArr[i]);
    });
    return buckets.map((b, h) => ({
      hourDecimal: h,
      temp: Math.round(avg(b.temp) * 10) / 10,
      solar: Math.max(0, Math.round(avg(b.solar))),
      windMs: Math.round(avg(b.wind) * 10) / 10,
      rhPct: Math.round(avg(b.rh)),
      cloudPct: Math.round(avg(b.cloud))
    }));
  }

  async function fetchOpenMeteo(lat, lon, opts) {
    opts = opts || {};
    if (!opts.forceRefresh) {
      const c = readCache(lat, lon);
      if (c) return c;
    }
    const url = "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${lat}&longitude=${lon}` +
      "&daily=temperature_2m_max,temperature_2m_min,shortwave_radiation_sum,wind_speed_10m_max,sunrise,sunset" +
      "&hourly=temperature_2m,shortwave_radiation,wind_speed_10m,relative_humidity_2m,cloud_cover" +
      `&timezone=auto&forecast_days=${FORECAST_DAYS}`;

    let j;
    try {
      j = await window.U.fetchJsonWithRetry(url, {
        timeoutMs: 5000, retries: 2,
        onRetry: () => { if (window.APP && window.APP.toast) window.APP.toast("Connection slow… retrying Open-Meteo…"); }
      });
    } catch (e) {
      const stale = readStaleCache(lat, lon);
      if (stale) {
        if (window.APP && window.APP.toast) window.APP.toast("Connection slow — using cached weather data.");
        return { ...stale, stale: true };
      }
      throw new Error("Could not reach Open-Meteo after retrying — check your internet connection.");
    }

    const hourly = buildTypicalDay(
      j.hourly.time, j.hourly.temperature_2m, j.hourly.shortwave_radiation,
      j.hourly.wind_speed_10m, j.hourly.relative_humidity_2m, j.hourly.cloud_cover
    );

    const tMin = Math.round(avg(j.daily.temperature_2m_min) * 10) / 10;
    const tMax = Math.round(avg(j.daily.temperature_2m_max) * 10) / 10;
    const solarKwhDay = Math.round((avg(j.daily.shortwave_radiation_sum) / 3.6) * 100) / 100; // MJ/m2 -> kWh/m2
    const sunrise = Math.round(avg(j.daily.sunrise.map(toDecimalHour)) * 100) / 100;
    const sunset = Math.round(avg(j.daily.sunset.map(toDecimalHour)) * 100) / 100;
    const windMs = Math.round((avg(j.daily.wind_speed_10m_max) / 3.6) * 10) / 10;
    const rhPct = Math.round(avg(hourly.map(h => h.rhPct)));
    const cloudPct = Math.round(avg(hourly.map(h => h.cloudPct)));

    const result = {
      tMin, tMax, solarKwhDay, sunrise, sunset, windMs, rhPct, cloudPct, hourly,
      elevationM: j.elevation,
      timezone: j.timezone,
      fetchedAt: Date.now(),
      period: FORECAST_DAYS + "-day forecast average"
    };
    writeCache(lat, lon, result);
    return result;
  }

  return { fetchOpenMeteo };
})();
