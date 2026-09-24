# AreaTherm

**Area-Specific Passive Shelter Design & Thermal Comfort Prediction Platform**

> "Design the shelter for the climate — not the climate for the shelter."

A physics-based decision-support platform for designing passive, energy-efficient
shelters for specific geographic/climatic conditions — built for the DRDO
innovation challenge *"Software Based Model Development for Design of Area
Specific Shelter for Thermal Comfort Maintenance,"* initial focus: Ladakh.

## What this is (read this before judging the tech stack)

Rather than hand over Angular/Spring Boot source that can't be verified
end-to-end this early ("no superficial UI mockup" is a hard requirement in
the brief), **Phase 1 was a complete, dependency-free, physics-based
prototype in HTML/CSS/vanilla JS**, with every calculation running client-side.
That prototype UI is still exactly what runs today — same screens, same
physics — but it's no longer standalone: the frontend now requires the real
Spring Boot backend (`backend/`) described below to be running, and every
official simulation/optimization result is computed server-side by a
numerically-verified Java port of this same engine, not recomputed
redundantly in two places. The thermal engine itself is a real hourly RC
energy-balance simulation (with occupant sensible/latent heat and
occupancy-linked ventilation), the optimizer evaluates 567 real candidate
designs, and every number on screen is re-derivable in the "Explain
Calculation" panels.

`ARCHITECTURE.md`, `DATABASE_SCHEMA.sql`, and `API_SPEC.md` define the target
production stack (Angular 18 + Spring Boot + MySQL + Redis). The Spring Boot
side of that target now exists and is wired up — see [`backend/`](backend/)
and [`backend/README.md`](backend/README.md). The Angular rewrite of this
frontend is still future work; this vanilla-JS UI talks to the real backend
API directly in the meantime.

## Run it

Two processes now, both required — the frontend is not standalone:

```bash
# 1. Backend (Spring Boot, H2 file DB — no external services needed)
cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=local

# 2. Frontend static server, in a separate terminal
python -m http.server 8743 --directory app
```

Then open `http://localhost:8743` and register an account (or sign in) —
every screen past the login gate needs a real backend session. (Opening
`app/index.html` directly via `file://` no longer works on its own, since it
still needs the backend reachable at `http://localhost:8080`.) See
[`backend/README.md`](backend/README.md) for backend details.

## Demo

Register/sign in, then click **"Run Live Demo"** (top-right, on every
screen). This fetches real live weather for Leh from Open-Meteo + NASA
POWER, runs an hourly thermal simulation on a baseline shelter (on the
backend), runs the design optimizer (567 candidate configurations, also on
the backend), and lands you on **Evaluator Summary** — a 2-3 minute story of
the problem, the model, and the recommended design. No hand-authored or
illustrative climate data is used anywhere — every climate figure is live
(falling back to cache, honestly labelled, if the network is briefly
unavailable); the simulation/optimization themselves are always real,
server-computed results, never mocked.

To walk the full workflow manually: **Dashboard → Location & Climate → Shelter
Designer → Materials → Thermal Simulation → Optimization → What-If Analysis →
Validation → Reports → Evaluator Summary → Settings** (left nav, top to bottom).

## What's real vs. what's a documented model assumption

| | |
|---|---|
| Thermal physics (sol-air conduction, SHGC solar gain, infiltration, occupancy-linked ventilation, two-node RC thermal mass) | **Real model**, formulas in `ARCHITECTURE.md` §3, reproducible in-app via "Explain Calculation" |
| Occupant heat (sensible/latent split by activity level) | **Real model**, watt figures order-of-magnitude from ASHRAE Fundamentals Ch. 9 / ISO 8996, split fractions simplified and documented — not a literal reproduction of those tables. See Settings. |
| Optimization (candidate generation + weighted multi-criteria scoring + sensitivity) | **Real**, not a black box — see `ARCHITECTURE.md` §4. Full 60-candidate table is sortable and CSV-exportable, not just the top 5. |
| Hourly weather for any of the 10 reference locations, or any custom lat/lon | **Real** — fetched client-side from [Open-Meteo](https://open-meteo.com) (no API key), a 7-day forecast averaged into a typical-day hourly curve, cached 7 days, with a timeout/retry/circuit-breaker reliability layer. See `app/js/weather-api.js`, `app/js/reliability.js`. |
| Annual solar potential ("kWh/m²/yr"), monthly solar/temperature, annual mean temperature | **Real** — fetched from [NASA POWER](https://power.larc.nasa.gov)'s 20-year (2001-2020) climatology, not extrapolated. See `app/js/nasa-power.js`. Falls back to a labelled forecast-based extrapolation only if that fetch fails. |
| Elevation | **Real** — fetched from Open-Meteo's Elevation API (SRTM-derived, no key). See `app/js/elevation.js`. |
| Material properties | **Engineering database reference values** — editable, labelled "verify for actual construction," explicitly **not** sourced from a CPWD/state PWD Schedule of Rates |
| Validation module error metrics (MAE/RMSE/MAPE/R²) | Real math, run against **user-provided or placeholder** measured rows — no field data exists yet |
| PDF report | **Real** — server-generated (OpenPDF/Flying Saucer) from an official backend simulation/optimization run; a browser print-to-PDF of the on-screen report is also still available as a quick offline alternative |
| CSV export (design candidates, material sheet, validation data) | Plain-JS CSV generation, no library — opens directly in Excel/Sheets |

No hand-authored, illustrative, or hardcoded climate dataset ships with this
app — every location's numbers come from a live fetch. Every screen that
shows climate-derived numbers displays a data-source badge, and that badge
always reflects which reliability tier actually served the number (live /
cached / stale cache) — never silently shown as live. See Settings →
"Data Source Transparency" for the full metric-by-metric source table.

## Reliability & offline behaviour

Every external API call (Open-Meteo, NASA POWER, elevation) goes through a
shared reliability layer (`app/js/reliability.js`): a request timeout, capped
exponential-backoff retries, a per-source circuit breaker (skips a
repeatedly-failing source for a cooldown window instead of hammering it), and
a live → fresh-cache → stale-cache fallback chain. Every simulation input is
validated before it reaches the physics solver (positive dimensions/
thickness, valid comfort range, valid coordinates), with a specific on-screen
message instead of a crash, and a global render-level exception handler shows
a clean recoverable message instead of a blank page or stack trace. This is
also why PDF and CSV export use zero external libraries rather than a
CDN-hosted one (jsPDF/SheetJS/a map tile provider): a live demo on
unreliable venue wifi should not depend on a CDN being reachable.

## Two ways to use it

- **Guided Setup** (left nav) — a 5-step wizard (Location → Shelter →
  Materials → Comfort & Occupancy → Run) with sane presets, aimed at
  non-engineers.
- **Advanced screens** (Location & Climate, Shelter Designer, Materials, …)
  — full parameter control, unchanged from Guided Setup's underlying model.

Guided Setup and the advanced screens share the same state — switching
between them mid-project is safe.

Nothing is fabricated as a measurement, a DRDO validation result, or an
accuracy claim — see the "Scientific Integrity" note in `ARCHITECTURE.md` §8.

## Repository layout

```
AreaTherm/
  README.md                 you are here
  ARCHITECTURE.md           production architecture, thermal model, optimization methodology, UI map, roadmap
  DATABASE_SCHEMA.sql        MySQL schema backend/ actually implements (all entities from the brief's §20)
  API_SPEC.md                REST API backend/ actually implements
  backend/                   Spring Boot 3 backend — see backend/README.md
  app/                       the frontend (open app/index.html; requires backend/ running)
    index.html
    sw.js                     app-shell service worker — caches only this app's own HTML/CSS/JS, never climate data
    css/styles.css            design system + dark mode
    js/
      config.js               branding + units + default weights + reliability/backend tuning (rename the app here)
      data.js                 10 reference locations, material library, comfort profiles, occupancy activity levels
      reliability.js          timeout / retry / circuit breaker / tiered cache, shared by every API client
      backend-api.js           thin client for backend/'s REST API (auth, CRUD, async job polling)
      adapter.js                bridges local design/state shapes <-> backend DTOs; orchestrates official runs
      weather-api.js          Open-Meteo live weather client (temp, solar, wind, RH, cloud, precipitation)
      nasa-power.js           NASA POWER climatology client (GHI/DNI/diffuse solar, temperature, monthly series)
      elevation.js             Open-Meteo Elevation API client (real elevation, no key)
      engine.js                thermal engine + occupancy heat model + optimizer + validation stats (pure functions, no DOM) — still used for live preview/what-if/sensitivity; official runs use backend/'s verified Java port instead
      charts.js                dependency-free inline-SVG chart renderer (line/bar/stacked/monthly/scatter/gauge)
      export.js                dependency-free CSV export
      validator.js             real-data validation: measured-vs-predicted datasets scored against the simulation
      shelter3d.js              optional 3D shelter preview (vanilla Three.js via an import map, no build step)
      store.js                 app state ("database"); projects/designs/etc. are backend-persisted now
      util.js, ui-auth.js, ui-1.js, ui-2.js, ui-3.js, app.js   screens + router + auth gate + global error handling
```

## Known limitations of this pass

- Real authentication now exists (JWT, register/login — see
  `backend/README.md`), but authorization scoping only reaches the
  top-level `Project` resource; a logged-in user can still reach another
  user's child resources (locations, designs, simulations, ...) by guessing
  an id. No ML surrogate model either (no training data exists yet — see
  `ARCHITECTURE.md` §9); the backend's `ml/` package is a deliberate stub.
- The 3D shelter preview (Shelter Designer) is an illustrative box
  approximation — it doesn't model curved (circular/dome) or L-shaped
  footprints, and door/window placement isn't tied to the per-face data
  model used elsewhere on that screen.
- **External data sources beyond Open-Meteo/NASA POWER/Open-Meteo Elevation
  are not wired up**, because they need a registered API key or account
  that hasn't been provisioned yet: ERA5/Copernicus CDS, IMD via
  data.gov.in, ISRO Bhuvan/OpenTopography (used here only for elevation,
  which Open-Meteo's free Elevation API already covers), and Solcast. The
  `ClimateProfile` abstraction is architected so any of these can be added
  as another adapter without touching the thermal engine.
- The Imperial/metric toggle (Settings) is display-only — the engine and
  every calculation stay metric (SI) internally.
- Simple mode shows Dashboard, Guided Setup, Materials, What-If Analysis,
  Reports and Settings only; Advanced mode exposes all screens.
- Projects, shelter designs, locations, climate profiles, simulations, and
  optimization runs are all backend-persisted now (real cross-device sync
  via login) — see `DATABASE_SCHEMA.sql` for the data model. Validation
  datasets and simulation history are the two exceptions: still device-local
  (`localStorage`/IndexedDB) only, since no backend endpoint exists for them
  yet.
- Shelter Designer's live preview, What-If Analysis, Sensitivity Analysis,
  and Explain Calculation's narration all still run the physics engine
  client-side, by design — they're instant interactive feedback that's never
  recorded as an official result, and the backend's simulation/optimization
  endpoints are async/polled (too slow for live-typing feedback). Every
  *official*, recorded run (Thermal Simulation, Optimization, Guided Setup,
  Run Live Demo) goes through the backend.
- A service worker (`app/sw.js`) caches only the app's own HTML/CSS/JS so
  the UI shell loads with no network — it never caches or fabricates climate
  data, and doesn't make the app usable offline anymore now that the backend
  is required for login and every official action.

## Next steps toward the full brief

1. ~~Stand up the Spring Boot/MySQL backend~~ — done, see [`backend/`](backend/).
   ~~Wire this frontend to that API~~ — done (auth, persistence, and
   official simulation/optimization runs all go through the backend now).
   Remaining backend gaps: authorization scoping beyond `Project`, a real ML
   surrogate, and endpoints for `/explain`, `/sensitivity`, and validation
   datasets (all still client-side only).
2. Build the Angular frontend against the same backend API, as originally
   scoped — this vanilla-JS UI keeps working as-is either way.
3. Instrument a pilot shelter in Leh/Kargil and feed real readings into the
   Validation module to get an actual MAE/RMSE against the model.
4. Add ERA5 / IMD / Solcast archive adapters behind the existing
   `ClimateProfile` abstraction once API credentials are available, for a
   cross-source confidence indicator and historical climatology beyond
   NASA POWER's coverage.
