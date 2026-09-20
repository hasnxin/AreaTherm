# AreaTherm

**Area-Specific Passive Shelter Design & Thermal Comfort Prediction Platform**

> "Design the shelter for the climate — not the climate for the shelter."

A physics-based decision-support platform for designing passive, energy-efficient
shelters for specific geographic/climatic conditions — built for the DRDO
innovation challenge *"Software Based Model Development for Design of Area
Specific Shelter for Thermal Comfort Maintenance,"* initial focus: Ladakh.

## What this is (read this before judging the tech stack)

This machine had no Java/Maven/Node/npm/Docker installed — only Python. Rather
than hand over Angular/Spring Boot source that can't be compiled or run here
("no superficial UI mockup" is a hard requirement in the brief), **Phase 1 is
a complete, dependency-free, physics-based prototype in HTML/CSS/vanilla JS**.
It is not a mockup: the thermal engine is a real two-node RC energy-balance
simulation, the optimizer evaluates real candidate designs, and every number
on screen is computed live and re-derivable in the "Explain Calculation" panels.

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
live weather for Leh from Open-Meteo + NASA POWER, runs a 24-hour thermal
simulation on a baseline shelter, runs the design optimizer (60 candidate
configurations), and lands you on **Evaluator Summary** — a 2-3 minute story
of the problem, the model, and the recommended design. No hand-authored or
illustrative climate data is used anywhere — every figure is live.

To walk the full workflow manually: **Dashboard → Location & Climate → Shelter
Designer → Materials → Thermal Simulation → Optimization → What-If Analysis →
Validation → Reports → Evaluator Summary → Settings** (left nav, top to bottom).

## What's real vs. what's a documented model assumption

| | |
|---|---|
| Thermal physics (sol-air conduction, SHGC solar gain, infiltration, two-node RC thermal mass) | **Real model**, formulas in `ARCHITECTURE.md` §3, reproducible in-app via "Explain Calculation" |
| Optimization (candidate generation + weighted multi-criteria scoring + sensitivity) | **Real**, not a black box — see `ARCHITECTURE.md` §4 |
| Hourly weather for any of the 10 reference locations | **Real** — fetched client-side from [Open-Meteo](https://open-meteo.com) (no API key), a 7-day forecast averaged into a typical-day hourly curve, cached 7 days. See `app/js/weather-api.js`. |
| Annual solar potential ("kWh/m²/yr") + annual mean temperature | **Real** — fetched from [NASA POWER](https://power.larc.nasa.gov)'s 20-year (2001-2020) climatology, not extrapolated. See `app/js/nasa-power.js`. Falls back to a labelled forecast-based extrapolation only if that fetch fails. |
| Material properties | **Engineering database reference values** — editable, labelled "verify for actual construction" |
| Validation module error metrics (MAE/RMSE/MAPE/R²) | Real math, run against **user-provided or placeholder** measured rows — no field data exists yet |
| PDF report | Browser print-to-PDF (production target: server-side rendering) |

No hand-authored, illustrative, or hardcoded climate dataset ships with this
app — every location's numbers come from a live fetch. Every screen that
shows climate-derived numbers displays a data-source badge so it's never
ambiguous where a number came from.

## Two ways to use it

- **Guided Setup** (left nav) — a 5-step wizard (Location → Shelter →
  Materials → Comfort → Run) with sane presets, aimed at non-engineers.
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
    css/styles.css
    js/
      config.js               branding + units + default weights (rename the app here)
      data.js                 10 reference locations, material library, comfort profiles (no climate data)
      weather-api.js          Open-Meteo live weather client
      nasa-power.js           NASA POWER climatology client (real annual solar/temp)
      engine.js               thermal engine + optimizer + validation stats (pure functions, no DOM)
      charts.js               dependency-free inline-SVG chart renderer
      store.js                app state ("database"), field-compatible with DATABASE_SCHEMA.sql
      util.js, ui-1.js, ui-2.js, ui-3.js, app.js   screens + router
```

## Known limitations of this pass

- No authentication/RBAC persistence, no historical/multi-year climatology
  beyond NASA POWER's solar/temperature figures (ERA5/IMD archive adapters
  are architected, not wired up), no 3D preview (2D top-down schematic
  only), no ML surrogate model (no training data exists yet — see
  `ARCHITECTURE.md` §9).
- Simple mode shows Dashboard, Guided Setup, Materials, What-If Analysis,
  Reports and Settings only; Advanced mode exposes all screens.
- State persists to `localStorage` per browser (not a shared multi-user
  database) — see `DATABASE_SCHEMA.sql` for the production data model.
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
4. Add ERA5 / IMD archive adapters behind the existing `ClimateProfile`
   abstraction, for historical climatology beyond NASA POWER's coverage.
