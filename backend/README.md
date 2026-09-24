# AreaTherm Backend

Production Spring Boot backend for **AreaTherm** — a physics-based
decision-support platform for designing passive, energy-efficient shelters
in extreme climates. The frontend (vanilla HTML/CSS/JS, no build step) lives
one level up at [`../app`](../app) and **requires this backend to be
running** — see the root [`../README.md`](../README.md) for how to run both
together. `thermal/` and `optimization/` are a numerically-verified,
line-for-line port of the frontend's own `../app/js/engine.js` physics and
optimizer; nothing about the underlying calculations was changed or
reinterpreted in the port.

No LLM is wired up anywhere in this build (see `ml/` below) — infrastructure
only, by design.

## Stack

Java 17 · Spring Boot 3.5.16 · Spring Data JPA · Spring Security (JWT) ·
Flyway · H2 (local) / MySQL 8 (containerized) · OpenPDF + Flying Saucer
(PDF reports) · springdoc-openapi.

## Architecture

```
api/            REST controllers (versioned /api/v1/...)
climate/        Location/ClimateProfile entities + service; live-fetch adapters are stubs (the frontend's own Open-Meteo/NASA POWER client-side fetch is what's actually live — see ../app/js/weather-api.js)
design/         ShelterDesign/Opening/ThermalMass/ComfortProfile + entity<->physics-record mapping
material/       Material entity + seeded catalog + MaterialCatalog builder for the optimizer
thermal/        Pure, framework-free physics engine (zero Spring/JPA deps — enforced by an ArchUnit test)
optimization/   Pure, framework-free 567-candidate optimizer (same purity guarantee)
simulation/     Simulation orchestration: entities -> physics records -> ThermalEngine -> persisted results
optimizationrun/  Optimization-run orchestration + persisted candidates + batched per-candidate design summaries
validation/     Validation-dataset entities (MAE/RMSE/MAPE/R² via ThermalEngine.validationStats) — no REST route yet
report/         Real PDF generation (OpenPDF/Flying Saucer, not a stub)
ml/             Deliberate stub — SurrogatePredictor.isAvailable() always false, no external calls
security/       JWT auth (register/login), Spring Security 6 filter chain, BCrypt, CORS
project/        Project CRUD, owner-scoped (list/get/create/delete all check the authenticated caller)
audit/          Audit log entity (schema in place; write-side hook not yet wired)
config/         Async executor for the QUEUED -> RUNNING -> COMPLETE/FAILED job lifecycle
```

`thermal/` and `optimization/` are pure Java records + static methods —
no Spring, no JPA, reusable from anywhere. Every other package maps JPA
entities to/from those plain physics records at the boundary (see
`ShelterDesignService`/`ClimateProfileService`/`MaterialLibraryService`).

## Running locally (zero external dependencies)

From this directory:

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Boots on port 8080 against a local H2 file database (`./data/areatherm`,
auto-created, Flyway-migrated on startup). Swagger UI at
`/swagger-ui.html`, H2 console at `/h2-console`. No global Maven install
needed — `mvnw`/`mvnw.cmd` bootstrap their own; only a JDK 17 is required.
CORS is configured for the frontend's default dev origin
(`http://localhost:8743`, see `areatherm.cors.allowed-origins` in
`application.yml`) — add your own origin there if you serve the frontend
differently.

## Running against MySQL (matches the documented production target)

```bash
podman compose up -d      # or: docker compose up -d
./mvnw spring-boot:run -Dspring-boot.run.profiles=docker
```

`docker-compose.yml` starts MySQL 8 only (Redis is documented as optional
in `../ARCHITECTURE.md` and isn't stood up here — nothing yet needs it).

## Tests

```bash
./mvnw test
```

9 tests: an ArchUnit check that `thermal`/`optimization` stay framework-free,
5 golden-file tests asserting the Java physics port against real captured
output from the frontend's own `../app/js/engine.js` (winter/summer, 15-min
timestep, PCM thermal mass, round geometry — see
`src/test/resources/physics`), and an optimizer smoke test (567-candidate
search, sensitivity analysis, window layout recommendation). All pass from
a clean clone using only the Maven wrapper.

## API surface

Base path `/api/v1`, JWT bearer auth (`POST /auth/register`,
`POST /auth/login`; everything else under `/api/v1/**` requires a token).
See `../API_SPEC.md` for the full documented contract. Implemented and
wired to the frontend: auth, projects, locations, materials, comfort
profiles, climate profiles (user-provided/frontend-persisted, with optional
hourly series — no live server-side fetch), shelter designs (full
create/read/update, including per-candidate detail for optimization runs),
simulations (async `202` -> poll, paginated time series), optimization runs
(async `202` -> poll, 567 candidates with per-candidate design summaries),
PDF reports. Not yet wired to a route: `/explain`, `/sensitivity` (the
engine method exists — `OptimizationEngine.sensitivityAnalysis` — just not
exposed as an endpoint), validation-dataset CRUD.

## Known limitations / explicit non-goals (this pass)

- **Authorization scoping stops at `Project`** — `ProjectController` derives
  the owner from the JWT and scopes list/get/delete to it, but none of the
  8 child-resource controllers (Location, ClimateProfile, ComfortProfile,
  ShelterDesign, Simulation, OptimizationRun, Material, Report) check that
  a given id actually belongs to the caller's own project. A real
  multi-tenant deployment needs this hardened across the board; this pass
  only fixed the top-level resource.
- No live server-side climate fetch — `climate/` adapters are stubs; the
  frontend's own client-side Open-Meteo/NASA POWER fetch is what's real,
  and gets persisted here as a `ClimateProfile` after the fact (always
  labelled `USER_PROVIDED` server-side, regardless of how it was actually
  obtained — the frontend's own data-source badge is the honest source of
  truth for that distinction, not this persisted copy).
- `ml/` is a genuine stub — no ML surrogate, no LLM, by design.
- No Redis, no message broker.
- No Testcontainers yet (MySQL is verified by hand against a real container
  during development).
- No cascading delete — `DELETE /projects/{id}` 409s if the project still
  has locations or shelter designs, rather than deleting them.
- No `PUT`/update for comfort profiles — a changed comfort min/max creates
  a new row rather than updating in place (old rows are simply left
  unused).
