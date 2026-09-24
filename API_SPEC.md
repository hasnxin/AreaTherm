# AreaTherm — REST API (production backend)

Implemented at [`backend/`](backend/) and wired to the frontend — see
[`backend/README.md`](backend/README.md) for what's actually live vs. still
a documented target. A few endpoints below (marked inline) were part of the
original target contract but were never built, because nothing in the
frontend ended up needing them as a separate route (`/geometry` is returned
inline as part of a simulation result; `/explain` and What-If are computed
entirely client-side; validation datasets stay device-local). Where the
built contract differs from what's documented here, the real controller
source under `backend/src/main/java/com/areatherm/api/` is authoritative —
this file describes intent, not a byte-exact wire trace.

Base path: `/api/v1`. Auth: `Authorization: Bearer <JWT>`. All bodies JSON.

## Projects
Not in the brief's own entity list, but every resource below is scoped by
`project_id`, so this exists as the necessary root:
- `GET /projects` — the caller's own projects only (owner derived from the JWT)
- `GET/DELETE /projects/{id}` — DELETE 409s if the project still has locations or shelter designs
- `POST /projects` — `{name, description?}`

## Locations & Climate
- `GET /locations` — list saved locations for the current project
- `POST /locations` — create a location `{country, state, district, village, latitude, longitude, elevationM}`
- `GET /locations/{id}/climate-profiles` — list climate profiles for a location
- `GET /climate-profiles/live?locationId=` — **not implemented**; live climate fetching stays entirely client-side (`app/js/weather-api.js`/`nasa-power.js`), the backend only ever receives an already-fetched profile via POST below
- `POST /climate-profiles` — create a user-provided climate profile (+ hourly series)

## Shelter Design
- `GET/POST /projects/{id}/shelter-designs` — GET returns a lightweight `{id,name,shape}` list; POST takes the full geometry/materials/openings/thermal-mass/comfort-profile payload
- `GET/PUT /shelter-designs/{id}` — full detail (geometry, orientation, wall/roof/floor, openings, thermal mass); no DELETE exists
- `GET /shelter-designs/{id}/geometry` — **not implemented** as its own route; geometry is returned inline as part of a simulation's `summary.geometry`

## Materials
- `GET /materials?category=WALL|ROOF|INSULATION|THERMAL_MASS|WINDOW`
- `POST /materials` — add a custom material (marked `isCustom: true`, `isEngineeringDbValue: false`)
- `PUT /materials/{id}` — edit (engineering DB values are configurable, not hard-coded)

## Comfort Profiles
- `GET /comfort-profiles` — human occupancy only: base min/max comfort temperature plus clothing-level (clo) and activity-level (met) presets, which shift the effective minimum comfort temperature (see `app/js/data.js`)
- `POST /comfort-profiles`

## Simulation
- `POST /simulations` — `{projectId, shelterDesignId, climateProfileId, timeStepMinutes, periodType, startAt, endAt, runByUserId?}` → `202 Accepted` + simulation id (status QUEUED/RUNNING/COMPLETE)
- `GET /simulations/{id}` — status + summary (daily energy balance, comfort stats, scores); `summary` is `null` until COMPLETE
- `GET /simulations/{id}/series` — full time series (paged) for charting
- `GET /simulations/{id}/explain?term=...` — **not implemented**; Explain Calculation is computed entirely client-side (it needs per-step fields, like raw solar irradiance, that the persisted series doesn't carry — see `app/js/adapter.js`'s `explainLocalRecompute`)

## Optimization
- `POST /optimization-runs` — `{projectId, baseShelterDesignId, climateProfileId, timeStepMinutes, periodType, weights?, broaderSearch?}` → `202 Accepted`; `broaderSearch` is accepted but always ignored (`ml/` is a stub, so `usedMlScreening` is always `false`)
- `GET /optimization-runs/{id}` — `{status, candidatesEvaluated, usedMlScreening, top, recommended, all}`; each candidate carries a `designSummary` (material slugs, orientation, insulation, window area/%, thermal mass — computed in one batched query for the whole `all` list, not per candidate)
- `GET /optimization-runs/{id}/sensitivity` — **not implemented** (always 501); the engine method (`OptimizationEngine.sensitivityAnalysis`) exists but isn't wired to a route — Sensitivity Analysis is computed entirely client-side instead

## What-If
- `POST /what-if` — **not implemented**; What-If Analysis runs entirely client-side (instant before/after comparison, never persisted or recorded)

## Validation
- `POST /validation-datasets` / `GET /validation-datasets/{id}` — **not implemented**; validation datasets stay device-local (`localStorage`) only

## Reports
- `POST /reports` — `{projectId, simulationId, optimizationRunId}` → generates PDF (server-side, e.g. OpenPDF/Flying Saucer), returns `fileUrl`
- `GET /reports/{id}` — metadata + download link

## Conventions
- Every response distinguishes `source`: `USER_INPUT` | `MODEL_ASSUMPTION` | `CALCULATED_RESULT` | `FIELD_MEASUREMENT` | `REAL_LIVE_FETCH` (Open-Meteo/NASA POWER), per the brief's scientific-integrity requirement.
- Errors: standard `{status, error, message, path}` envelope.
- All numeric fields carry explicit units in the field name or an adjacent `unit` field (never bare numbers) — see ARCHITECTURE.md §UNITS in `app/js/config.js` for the canonical unit set.
