# AreaTherm — Target REST API (production backend)

Not implemented in this pass (no backend runtime in this environment — see
ARCHITECTURE.md §0). The prototype calls the equivalent logic directly as
JS functions (`app/js/engine.js`, `app/js/store.js`). This is the contract
a Spring Boot backend should expose so the same frontend calls map 1:1.

Base path: `/api/v1`. Auth: `Authorization: Bearer <JWT>`. All bodies JSON.

## Locations & Climate
- `GET /locations` — list saved locations for the current project
- `POST /locations` — create a location `{country, state, district, village, latitude, longitude, elevationM}`
- `GET /locations/{id}/climate-profiles` — list climate profiles for a location
- `GET /climate-profiles/live?locationId=` — fetch/refresh a location's live Open-Meteo weather + NASA POWER climatology, cached server-side (5-7 day TTL)
- `POST /climate-profiles` — create a user-provided climate profile (+ hourly series)

## Shelter Design
- `GET/POST /projects/{id}/shelter-designs`
- `GET/PUT/DELETE /shelter-designs/{id}` — geometry, orientation, wall/roof/floor, openings, thermal mass, comfort profile
- `GET /shelter-designs/{id}/geometry` — server-computed floor area, volume, wall/roof area (mirrors `engine.computeGeometry`)

## Materials
- `GET /materials?category=WALL|ROOF|INSULATION|THERMAL_MASS|WINDOW`
- `POST /materials` — add a custom material (marked `isCustom: true`, `isEngineeringDbValue: false`)
- `PUT /materials/{id}` — edit (engineering DB values are configurable, not hard-coded)

## Comfort Profiles
- `GET /comfort-profiles` — human occupancy only: base min/max comfort temperature plus clothing-level (clo) and activity-level (met) presets, which shift the effective minimum comfort temperature (see `app/js/data.js`)
- `POST /comfort-profiles`

## Simulation
- `POST /simulations` — `{shelterDesignId, climateProfileId, timeStepMinutes, periodType, startAt, endAt}` → `202 Accepted` + simulation id (status QUEUED/RUNNING/COMPLETE)
- `GET /simulations/{id}` — status + summary (daily energy balance, comfort stats, scores)
- `GET /simulations/{id}/series` — full time series (paged) for charting
- `GET /simulations/{id}/explain?term=wall|roof|floor|opening|vent|mass|solar|score` — formula + substituted values for the Explain Calculation panel

## Optimization
- `POST /optimization-runs` — `{projectId, baseShelterDesignId, weights: {comfort, retention, solar, energy, cost}}` → runs candidate generation + scoring
- `GET /optimization-runs/{id}` — candidates evaluated, top 5 (`design_candidate` rows), recommended
- `GET /optimization-runs/{id}/sensitivity` — ranked parameter-impact list

## What-If
- `POST /what-if` — `{shelterDesignId, climateProfileId, perturbation}` → before/after simulation summaries (stateless, not persisted as its own entity — reuses `/simulations` under the hood)

## Validation
- `POST /validation-datasets` — `{projectId, shelterDesignId, points: [{ts, ambientTempC, measuredIndoorTempC, solarRadiationWm2, windSpeedMs, relativeHumidityPct}]}`
- `GET /validation-datasets/{id}` — predicted-vs-measured points + MAE/RMSE/MAPE/R²

## Reports
- `POST /reports` — `{projectId, simulationId, optimizationRunId}` → generates PDF (server-side, e.g. OpenPDF/Flying Saucer), returns `fileUrl`
- `GET /reports/{id}` — metadata + download link

## Conventions
- Every response distinguishes `source`: `USER_INPUT` | `MODEL_ASSUMPTION` | `CALCULATED_RESULT` | `FIELD_MEASUREMENT` | `REAL_LIVE_FETCH` (Open-Meteo/NASA POWER), per the brief's scientific-integrity requirement.
- Errors: standard `{status, error, message, path}` envelope.
- All numeric fields carry explicit units in the field name or an adjacent `unit` field (never bare numbers) — see ARCHITECTURE.md §UNITS in `app/js/config.js` for the canonical unit set.
