# AreaTherm — Architecture, Thermal Model & Optimization Methodology

"Design the shelter for the climate — not the climate for the shelter."

> **Naming**: "AreaTherm" is a placeholder brand name. It appears only in
> `app/js/config.js` (`APP_NAME`, `APP_SUBTITLE`) and is trivial to change —
> nothing else in the codebase hard-codes it.

## 0. Phasing note (read this first)

Given the DRDO evaluation criterion "the core workflow must actually
function" and "test the complete workflow" before declaring completion, a
full Angular/Spring Boot/MySQL stack that can't be verified end-to-end this
early risks becoming an *unverifiable* mockup — exactly what the brief
prohibits ("Do NOT build only a calculator" / "not a superficial UI
mockup").

**Decision**: Phase 1 of this prototype is a self-contained, dependency-free
web application (plain HTML/CSS/JS, no build step, no external services)
that implements the *entire* workflow — including the real physics engine
and the real multi-parameter optimizer — client-side. It runs by opening
`app/index.html` in any browser. This is not a wireframe: every number shown
is computed by the same equations documented in §4 below.

Section 1 below is the target production architecture. The prototype's code
is deliberately organized (see §6, file layout) so each JS module maps onto
a specific Spring Boot service / Angular feature module, making the port
mechanical rather than a redesign.

---

## 1. Proposed Production Architecture (target)

```
┌───────────────────────────────────────────────────────────────────────┐
│  Angular 18+ SPA (feature modules mirror the nav in §5)                │
│  - Dashboard, Location/Climate, Shelter Designer, Materials,           │
│    Thermal Simulation, Optimization, What-If, Validation, Reports      │
│  - Apache ECharts for time-series/Sankey, Three.js for 3D preview      │
│  - Role-aware routing (Simple Mode / Advanced Engineering Mode)        │
└───────────────────────────────────────────────────────────────────────┘
                              │ REST (JSON) + JWT
┌───────────────────────────────────────────────────────────────────────┐
│  Spring Boot 3 (modular monolith, package-by-feature)                 │
│  ├─ api/            REST controllers (versioned /api/v1/...)          │
│  ├─ climate/         ClimateProfileService, external-source adapters  │
│  │                    (stubs today: NASA POWER / ERA5 / IMD clients)  │
│  ├─ design/          ShelterDesignService, geometry validation        │
│  ├─ material/        MaterialLibraryService (seeded + custom)         │
│  ├─ thermal/         ThermalEngine (pure, stateless, unit-tested)     │
│  ├─ optimization/    CandidateGenerator, MultiCriteriaScorer,         │
│  │                    SensitivityAnalyzer                             │
│  ├─ validation/      MeasuredDataService, ErrorMetricsService         │
│  ├─ report/          ReportService (PDF via OpenPDF/Flying Saucer)    │
│  ├─ ml/              Surrogate-model layer (optional, §9)             │
│  ├─ security/        Spring Security + JWT, role-based guards         │
│  └─ audit/           Versioning + audit log (Envers or manual)        │
└───────────────────────────────────────────────────────────────────────┘
        │                              │
┌───────────────┐            ┌──────────────────┐
│ MySQL 8       │            │ Redis (optional)  │
│ schema in     │            │ - simulation job   │
│ DATABASE_     │            │   cache             │
│ SCHEMA.sql    │            │ - session/rate-limit│
└───────────────┘            └──────────────────┘
```

Key principle: **`thermal/` and `optimization/` contain zero framework
dependencies** — pure functions taking value objects and returning value
objects. This is what makes them unit-testable, reusable from a batch job,
and reusable from the ML surrogate trainer. The JS prototype mirrors this:
`app/js/engine.js` has no DOM code in it at all.

Deployment: each service Dockerized (`Dockerfile` per module in a real
build), `docker-compose.yml` for app+MySQL+Redis locally, ECS/EKS-compatible
on AWS. Not implemented in Phase 1 — documented here for when the target
infra is available.

---

## 2. Database Model (target MySQL — see `DATABASE_SCHEMA.sql`)

Entities exactly as specified in the brief, §20:

`user`, `location`, `climate_profile`, `climate_profile_hourly` (time series
child table), `shelter_design`, `material`, `material_layer` (join: which
material + thickness is used in which design layer — wall/roof/floor),
`opening`, `thermal_mass`, `comfort_profile`, `simulation`,
`simulation_result` (time series child table), `optimization_run`,
`design_candidate`, `validation_dataset`, `validation_dataset_point`,
`report`.

Versioning: `climate_profile.version`, `material.version`,
`simulation.model_version`, `optimization_run.algorithm_version` columns +
an `audit_log` table (entity, entity_id, action, actor, before/after JSON,
timestamp) satisfy "maintain versioning" (§20) and "audit logs" (§28).

The prototype's `app/js/store.js` implements the *same* entities as
in-memory/localStorage objects, field-for-field compatible with the SQL
schema, so a future API client swap is a data-layer change only.

---

## 3. Thermal Model (physics-based, transparent — see `app/js/engine.js`)

Single-zone, two-node lumped-capacitance (RC) network, explicit hourly (or
15/30-min) time-stepping. Two temperature nodes: **indoor air** (`T_air`)
and **thermal mass** (`T_mass`), so charge/discharge behaviour of thermal
mass is visible, not hand-waved.

### 3.1 Sol-air temperature (opaque surfaces: wall, roof)

```
T_sol-air(t) = T_amb(t) + (α_surface × G_surface(t)) / h_o
```
- `α_surface` — solar absorptivity of the outer finish
- `G_surface(t)` — irradiance on that surface (horizontal for roof,
  orientation-adjusted for walls via an orientation factor table, §3.5)
- `h_o` — outside film coefficient (default 23 W/m²K, wind-adjusted)

This folds opaque-surface solar gain into the conduction term, standard
building-physics practice (ASHRAE sol-air temperature concept), and is
disclosed as an assumption (longwave sky-radiation correction term is
omitted — see Assumptions panel).

### 3.2 Conduction losses/gains

```
Q_wall(t)  = U_wall  × A_wall  × (T_air(t) − T_sol-air,wall(t))
Q_roof(t)  = U_roof  × A_roof  × (T_air(t) − T_sol-air,roof(t))
Q_floor(t) = U_floor × A_floor × (T_air(t) − T_ground)
Q_window,cond(t) = U_window × A_window × (T_air(t) − T_amb(t))
```
Positive `Q` = heat leaving the shelter (a loss) when indoor is warmer.
`T_ground` is a configurable assumption (default: monthly mean ambient).

### 3.3 Solar heat gain through glazing

```
Q_solar,window(t) = Σ_windows  A_window × G(t) × orientation_factor × SHGC
```
`SHGC` (solar heat gain coefficient) comes from the glazing's material
record; `orientation_factor` from §3.5.

### 3.4 Ventilation / infiltration

```
Q_vent(t) = ACH × Volume / 3600 × ρ_air × Cp_air × (T_air(t) − T_amb(t))
```
`ρ_air` = 1.2 kg/m³, `Cp_air` = 1005 J/kg·K, `ACH` derived from the
air-leakage-rate input.

### 3.5 Orientation factor (documented assumption, user-editable)

Default table (relative solar aperture effectiveness through the winter
low-sun-angle window typical of Ladakh):
`South = 1.00, SE/SW = 0.85, East/West = 0.55, NE/NW = 0.30, North = 0.15`,
plus true azimuth-based cosine model when a custom azimuth is entered.

### 3.6 Thermal mass node

```
Q_exchange(t) = h_mass × A_mass × (T_air(t) − T_mass(t))
C_mass × dT_mass/dt = Q_exchange(t) + f_solar_to_mass × Q_solar,window(t)
```
`C_mass = mass × Cp_material` (PCM materials use an elevated apparent `Cp`
across their phase-change band — a documented simplification of latent
heat, not a full enthalpy method).

### 3.7 Indoor air energy balance (explicit Euler, Δt = time step)

```
C_air × ΔT_air/Δt =
    Q_solar,window(t) + Q_internal(t) − Q_exchange(t)
    − Q_wall(t) − Q_roof(t) − Q_floor(t) − Q_window,cond(t) − Q_vent(t)

C_air = Volume × ρ_air × Cp_air   (× furnishing factor, default 1.0)
```

### 3.8 Derived outputs (all shown with full working in "Explain
Calculation")

- Heating/cooling requirement: hours where `T_air` is outside the comfort
  band, integrated as `Σ U_total × A_total × |T_comfort_bound − T_air(t)|
  × Δt` — the auxiliary energy that *would* be needed to hold comfort.
- Comfort hours = count of timesteps with `comfort_min ≤ T_air ≤
  comfort_max`.
- Solar utilization % = (solar energy that reduced/avoided a loss) ÷
  (total incident solar energy on the envelope).
- Thermal Comfort Score (0–100) = weighted blend of a comfort-percentage
  term, solar utilization %, heat-retention %, and energy adequacy —
  weights configurable, shown in full in Explain Calculation. The
  comfort-percentage term itself blends how often indoor temperature was
  in the comfort band with how mild the average miss was on the hours it
  wasn't (normalized against the comfort band's own width), so a design
  that misses badly scores clearly worse than one that misses narrowly at
  the same in-band %.

All formulas above are re-printed, with the run's actual numbers substituted
step by step, in every "Explain Calculation" panel — nothing is a black box.

### 3.9 Occupancy heat model (sensible/latent split + ventilation coupling)

Each occupant's total heat output (`data.js` `ACTIVITY_LEVELS`, watt figures
order-of-magnitude from ASHRAE Fundamentals Handbook Ch. 9 / ISO 8996) is
split into a sensible share (heats the indoor-air node) and a latent share
(reported as an illustrative moisture-generation figure only — this model has
no humidity/psychrometric state node):

```
Q_occupant,total   = persons × activity.watts
Q_occupant,sensible = Q_occupant,total × activity.sensibleFrac   (feeds §3.7's Q_internal)
Q_occupant,latent   = Q_occupant,total − Q_occupant,sensible      (kg/h moisture, display only)
```

`sensibleFrac` uses simplified fixed fractions per activity level that
approximate the general trend in those references (sensible share falls as
activity rises) — not a literal reproduction of their exact per-temperature
tables. `Q_internal` in §3.7 is `Q_occupant,sensible + equipment gain` (the
latter is any other internal gain — a heater, electronics — kept separate).

Ventilation (§3.4) is coupled to occupancy via a documented per-person
fresh-air allowance, not a fixed constant:

```
ACH_total = ACH_infiltration (wind-adjusted, §3.4) + ACH_occupancy
ACH_occupancy = (persons × OCCUPANT_FRESH_AIR_LPS × 3.6) / Volume
```

`OCCUPANT_FRESH_AIR_LPS` (`config.js`, default 7.5 L/s/person) is an
order-of-magnitude ventilation guideline, not a specific code-compliance
calculation. Because `Q_vent` is linear in ACH, the occupancy-linked share of
ventilation loss is an *exact* partition (`ACH_occupancy / ACH_total × Q_vent`
at each timestep), not an approximation — so the app can show, side by side,
the gross sensible heat an occupant adds and the extra ventilation loss their
presence causes, and label the net effect explicitly rather than leaving a
comfort-score plateau at high occupancy unexplained.

### 3.10 Reliability layer

`app/js/reliability.js` wraps every external API call (Open-Meteo, NASA
POWER, the elevation API) with: a request timeout (`AbortController`),
capped exponential-backoff retries, a per-source circuit breaker (after N
consecutive failures, skip live attempts for a cooldown window rather than
retrying immediately), and a tiered cache fallback (live → fresh cache →
stale cache → a clear error). The data-source badge shown throughout the UI
always reflects which tier actually served a number — a stale-cache hit is
never displayed identically to a live fetch. `engine.js` additionally exposes
`validateDesign()`/`validateCoordinates()`, run before every simulation entry
point, so a non-positive dimension, an inverted comfort band, or an
out-of-range coordinate produces a specific on-screen message instead of a
NaN or a divide-by-zero reaching the RC solver. `app.js` wraps every screen
render in a try/catch that shows a clean recoverable message instead of a
blank page or a raw stack trace.

---

## 4. Optimization Methodology

```
Baseline design + variable ranges
        ↓
Candidate generator (orientation × wall system × insulation thickness ×
                      window % × glazing × thermal-mass level)
        ↓
Thermal Engine run per candidate (same equations as §3)
        ↓
Multi-criteria weighted score:
  Thermal Comfort 40% · Heat Retention 25% · Solar Utilization 15% ·
  Energy Efficiency 10% · Cost 10%   (all weights user-adjustable, live)
        ↓
Rank → Top 5 shown as Design A–E, highest-scoring = Recommended
        ↓
Sensitivity analysis: perturb one parameter at a time from the
  recommended design, measure Δ(comfort score) → ranked impact bars
```

This is a **weighted-sum multi-criteria evaluation over a sampled design
space** (documented as such — not a black-box "AI recommendation"). Section
9 covers the optional ML surrogate layer.

The Optimization screen shows both the top 5 (Design A–E, as above) and the
full evaluated set (`runOptimization()`'s `all` field — all 60 candidates,
not just the top 5), sortable by any scored column and exportable to CSV —
so a reviewer can audit the whole search, not just the winner.

---

## 5. UI Screen Map

```
Dashboard
├── Location & Climate     (10 reference locations, live Open-Meteo + NASA POWER, charts)
├── Shelter Designer       (geometry, shape, orientation, 2D preview)
├── Materials              (library: wall/roof/insulation/mass/window)
├── Thermal Simulation     (run, indoor-vs-ambient-vs-comfort chart,
│                            heat-flow Sankey, Explain Calculation)
├── Optimization           (weights, candidate table, comparison,
│                            recommended design, sensitivity chart)
├── What-If Analysis       (single-parameter before/after)
├── Validation             (measured-data entry, MAE/RMSE/MAPE/R²)
├── Reports                (assembled report, print/PDF)
├── Evaluator Summary       (2–3 minute story for a DRDO reviewer)
└── Settings                (assumptions & limitations, units, weights)
```
Every screen offers **Simple Mode** (fewer fields, sane defaults, big
live-demo button) and **Advanced Mode** (full parameter set, editable
material properties, editable orientation-factor table, custom time steps).

---

## 6. Prototype File Layout (maps to §1)

```
app/
  index.html            SPA shell + nav (→ Angular AppComponent/routes)
  css/styles.css        design system (scientific/technical) + dark mode
  js/config.js          branding + units + default weights + reliability tuning
  js/data.js            10 reference locations, material library, comfort
                         profiles, occupancy activity levels (→ seed data / Flyway)
  js/reliability.js     timeout/retry/circuit-breaker/tiered cache, shared
                         by every external API client (→ a resilience/retry
                         library + @Cacheable in the Spring Boot port)
  js/weather-api.js     Open-Meteo live weather client (→ climate/ adapter)
  js/nasa-power.js      NASA POWER climatology client (→ climate/ adapter)
  js/elevation.js       Open-Meteo Elevation API client (→ climate/ adapter)
  js/engine.js          solar + thermal RC model + occupancy heat model +
                         optimizer + validation stats + input validation
                         (→ thermal/, optimization/)
  js/charts.js          dependency-free inline-SVG chart renderer
                         (→ ECharts config builders)
  js/export.js          dependency-free CSV export (→ a report/export service)
  js/store.js           entity state + localStorage persistence
                         (→ JPA repositories / REST client)
  js/util.js, ui-1.js, ui-2.js, ui-3.js, app.js
                         shared DOM helpers, screen rendering + event wiring,
                         router/bootstrap + global error handling
                         (→ Angular components + routing)
```

---

## 7. Implementation Plan (status)

Phases 1–11 from the brief are delivered in this pass as a single running
prototype rather than sequential milestones (feasible because there is no
build/deploy step to gate on). Validation (Phase 9) and Reports (Phase 10)
are included. Live weather-API integration is implemented client-side:
Open-Meteo (`app/js/weather-api.js`) drives the hourly simulation, NASA
POWER (`app/js/nasa-power.js`) supplies real 20-year solar/temperature
climatology, and Open-Meteo's Elevation API (`app/js/elevation.js`) supplies
real elevation — for all 10 reference locations *and* any manually-entered
lat/lon — with a Guided Setup wizard as the simplified entry point. Every
external call goes through a shared reliability layer (§3.10): timeouts,
retries, a circuit breaker, and a tiered live/cache/stale-cache fallback,
so a flaky network degrades gracefully instead of freezing the UI. Occupant
heat is modelled with a sensible/latent split by activity level, coupled to
ventilation (§3.9), so higher occupancy shows its real trade-off (more body
heat, but also more ventilation loss) instead of a hidden constant. The
Optimization screen exposes the full 60-candidate set, sortable and
CSV-exportable, not just the top 5. No hand-authored or illustrative climate
dataset ships with the app. Not implemented (explicitly out of scope for
this pass, tracked for the production build): real authentication/RBAC
persistence, ERA5/IMD/Solcast archive integration (each needs a registered
API key not yet provisioned — NASA POWER + Open-Meteo cover
solar/temperature climatology and forecast weather in the meantime), an
interactive map location picker or 3D preview (both would need a CDN-hosted
library, which conflicts with the offline-safety goal — 2D top-down +
manual lat/lon entry are used instead), server-side PDF/XLSX rendering
(dependency-free browser print-to-PDF and plain-JS CSV are used instead, for
the same offline-safety reason), a Celsius/Fahrenheit or metric/imperial
unit toggle, multi-project save/load, ML surrogate model (architecture
documented in §9, not trained — no labelled field data exists yet to train
or validate one).

## 8. Assumptions register (also shown live in-app under Settings)

Steady vs transient: transient (explicit hourly RC model), not steady-state.
Outside film coefficient fixed at 23 W/m²K, wind-adjusted by a simple linear
factor. Sky longwave radiation exchange is not separately modelled (folded
into the sol-air simplification). Ground temperature defaults to monthly
mean ambient unless overridden. Below-slab ground-coupling resistance
(R_GROUND, engine.js) is a flat generic building-physics default (0.50
m²K/W) applied everywhere — not location-specific soil data, even though
real per-location soil composition is now fetched and shown for context on
the Location & Climate page (texture alone, without moisture content, isn't
a strong enough signal to justify a location-specific value here). Internal
gains are constant-per-hour unless
an occupancy schedule is supplied. Occupant heat uses fixed watt figures per
activity level (ASHRAE Fundamentals Ch. 9 / ISO 8996 order of magnitude)
split into sensible/latent by simplified fixed fractions, and ventilation
includes a documented per-person fresh-air allowance on top of wind-adjusted
infiltration (§3.9) — neither is a specific standard-compliance calculation.
PCM modelled via elevated apparent specific heat over its melt band, not a
full enthalpy method. Weather inputs are a live Open-Meteo forecast average
(with real elevation from Open-Meteo's Elevation API) blended with NASA
POWER climatology for the annual solar/temperature figures — never claimed
as measured or field-validated, and a network hiccup falls back to cached
data, explicitly labelled as cached or stale, never silently shown as live
(§3.10). The Thermal Comfort Score is a custom, project-defined weighted
index, not PMV/PPD or any other recognised thermal-comfort standard, and
material costs are a materials + installation + waste-factor planning
estimate, not a CPWD/state PWD Schedule of Rates figure.

## 9. AI/ML Layer (documented, not built)

```
Physics Model  →  Simulation Dataset (candidate runs + scores)
               →  ML Surrogate (e.g. gradient-boosted regressor) trained
                   to predict comfort score from design parameters, so the
                   optimizer can search a larger space without a full
                   physics run per candidate
               →  Optimization Engine uses surrogate for coarse search,
                   physics engine to verify the final shortlist
```
Every ML-derived number would be labelled **"ML-based estimation"**, never
mixed with **"Model Prediction"** (physics) or **"Field measurement"**
values. Not implemented here — no training data exists yet, and the brief
explicitly prohibits claiming ML accuracy without validation data.
