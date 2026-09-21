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
the brief), **Phase 1 is a complete, dependency-free, physics-based
prototype in HTML/CSS/vanilla JS**.
It is not a mockup: the thermal engine is a real hourly RC energy-balance
simulation (with occupant sensible/latent heat and occupancy-linked
ventilation), the optimizer evaluates 60 real candidate designs, and every
number on screen is computed live and re-derivable in the "Explain
Calculation" panels. It is also deliberately **dependency-free at runtime**:
no CDN-hosted library is required for the app to work, including PDF/CSV
export — see "Reliability & offline behaviour" below for why that matters
for a live demo.

`ARCHITECTURE.md`, `DATABASE_SCHEMA.sql`, and `API_SPEC.md` define the target
production stack (Angular 18 + Spring Boot + MySQL + Redis) and are written so
the prototype's modules (`app/js/engine.js`, `store.js`, `data.js`) port onto
that backend mechanically rather than needing a redesign.

## Run it

No build step. Any static file server works:

```bash
python -m http.server 8743 --directory app
```

Then open `http://localhost:8743`. (Opening `app/index.html` directly via
`file://` also works in most browsers — a static server just avoids any
browser file-access restrictions.)

## Demo

Click **"Run Live Demo"** (top-right, on every screen). This fetches real
live weather for Leh from Open-Meteo + NASA POWER, runs an hourly thermal
simulation on a baseline shelter, runs the design optimizer (60 candidate
configurations), and lands you on **Evaluator Summary** — a 2-3 minute story
of the problem, the model, and the recommended design. No hand-authored or
illustrative climate data is used anywhere — every figure is live (falling
back to cache, honestly labelled, if the network is briefly unavailable).

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
| PDF report | Browser print-to-PDF (works fully offline, no library; production target: server-side rendering) |
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
  DATABASE_SCHEMA.sql        target MySQL schema (all entities from the brief's §20)
  API_SPEC.md                target REST API for the Spring Boot backend
  app/                       the running prototype (open app/index.html)
    index.html
    sw.js                     app-shell service worker — caches only this app's own HTML/CSS/JS, never climate data
    css/styles.css            design system + dark mode
    js/
      config.js               branding + units + default weights + reliability tuning (rename the app here)
      data.js                 10 reference locations, material library, comfort profiles, occupancy activity levels
      reliability.js          timeout / retry / circuit breaker / tiered cache, shared by every API client
      weather-api.js          Open-Meteo live weather client (temp, solar, wind, RH, cloud, precipitation)
      nasa-power.js           NASA POWER climatology client (GHI/DNI/diffuse solar, temperature, monthly series)
      elevation.js             Open-Meteo Elevation API client (real elevation, no key)
      engine.js                thermal engine + occupancy heat model + optimizer + validation stats (pure functions, no DOM)
      charts.js                dependency-free inline-SVG chart renderer (line/bar/stacked/monthly/scatter/gauge)
      export.js                dependency-free CSV export
      validator.js             real-data validation: measured-vs-predicted datasets scored against the simulation
      shelter3d.js              optional 3D shelter preview (vanilla Three.js via an import map, no build step)
      store.js                 app state ("database"), field-compatible with DATABASE_SCHEMA.sql
      util.js, ui-1.js, ui-2.js, ui-3.js, app.js   screens + router + global error handling
```

## Known limitations of this pass

- No authentication/RBAC persistence, no ML surrogate model (no training
  data exists yet — see `ARCHITECTURE.md` §9).
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
- State persists to `localStorage` per browser (not a shared multi-user
  database) — see `DATABASE_SCHEMA.sql` for the production data model.
  Multiple named projects can be saved, switched between, and deleted
  locally, but there's no cross-device sync.
- A service worker (`app/sw.js`) caches only the app's own HTML/CSS/JS so
  the UI loads and runs with no network — it never caches or fabricates
  climate data. Offline runs are limited to whatever locations already have
  a live weather fetch cached in `localStorage` from an earlier online
  session (7-day Open-Meteo / 5-day NASA POWER TTL).

## Next steps toward the full brief

1. Stand up the Spring Boot/MySQL backend against `DATABASE_SCHEMA.sql` and
   `API_SPEC.md`; port `engine.js` to a Java `thermal` service (it's already
   framework-free, so this is largely a language port, not a redesign).
2. Wire the Angular frontend to that API instead of `store.js`.
3. Instrument a pilot shelter in Leh/Kargil and feed real readings into the
   Validation module to get an actual MAE/RMSE against the model.
4. Add ERA5 / IMD / Solcast archive adapters behind the existing
   `ClimateProfile` abstraction once API credentials are available, for a
   cross-source confidence indicator and historical climatology beyond
   NASA POWER's coverage.
