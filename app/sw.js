/* AreaTherm — app-shell service worker.
   Caches only the app's own static files (HTML/CSS/JS) so the UI loads and
   runs with no network at all — useful on flaky venue wifi. It does NOT
   cache or fabricate any climate/weather data: Open-Meteo, NASA POWER and
   Nominatim requests always go straight to the network (or fail honestly),
   exactly as documented in README.md's "no illustrative climate data"
   principle. Real weather already has its own 7-day/5-day localStorage
   cache in weather-api.js/nasa-power.js — this worker doesn't touch that. */

const CACHE_NAME = "areatherm-shell-v1";
const SHELL_FILES = [
  "./",
  "index.html",
  "css/styles.css",
  "js/util.js", "js/config.js", "js/data.js", "js/weather-api.js", "js/nasa-power.js",
  "js/engine.js", "js/charts.js", "js/store.js", "js/validator.js",
  "js/ui-1.js", "js/ui-2.js", "js/ui-3.js", "js/app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only handle GETs for our own origin's app-shell files. Everything else
  // (weather/solar/geocoding APIs, anything cross-origin) passes straight
  // through untouched.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached); // offline — fall back to whatever's cached
      return cached || network;
    })
  );
});
