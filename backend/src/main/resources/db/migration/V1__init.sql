-- =====================================================================
-- AreaTherm — Target production schema (MySQL 8, also used as-is on H2
-- for local dev via the same Flyway migration — see backend/src/main/
-- resources/db/migration/V1__init.sql).
-- Mirrors the entities the prototype keeps in app/js/store.js so a real
-- Spring Boot backend can be swapped in without a data-model redesign.
--
-- Portability notes:
-- 1. Every enumerated column is VARCHAR + CHECK rather than a native MySQL
--    ENUM(...) — native ENUM syntax isn't consistent between MySQL and H2,
--    and VARCHAR+CHECK matches Hibernate's default EnumType.STRING mapping
--    exactly. Two value sets aren't valid Java identifiers as spelled here
--    (time_step_minutes' 15/30/60, period_type's '24H') — the stored values
--    are unchanged, the Java side maps them via a plain int column
--    (time_step_minutes) or an explicit AttributeConverter (period_type),
--    never EnumType.STRING's default name()-based mapping, for those two
--    columns specifically.
-- 2. Every foreign key uses an explicit named `CONSTRAINT ... FOREIGN KEY
--    (...) REFERENCES ...(...)` clause, not the bare inline
--    `column_type REFERENCES table(col)` shorthand. That shorthand is
--    silently accepted but creates NO real constraint on MySQL (verified:
--    after applying an earlier draft of this file with the shorthand form
--    to a real MySQL 8 container, information_schema.KEY_COLUMN_USAGE
--    showed zero foreign keys, even though every table and CHECK
--    constraint worked correctly) — H2 happens to honor the shorthand as a
--    real constraint, which let that gap pass unnoticed there. The explicit
--    form is real ANSI SQL both databases enforce identically.
-- =====================================================================

CREATE TABLE app_user (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  display_name    VARCHAR(255) NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'ENGINEER'
                    CHECK (role IN ('ADMIN','RESEARCHER','ENGINEER','VIEWER')),
  password_hash   VARCHAR(255) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_id        BIGINT NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- No ON UPDATE CURRENT_TIMESTAMP here (a MySQL-only extension H2 doesn't
  -- support) — the JPA entity sets this via Hibernate's @UpdateTimestamp
  -- instead, which works identically on both databases.
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_project_owner FOREIGN KEY (owner_id) REFERENCES app_user(id)
);

CREATE TABLE location (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL,
  country         VARCHAR(100) NOT NULL DEFAULT 'India',
  state           VARCHAR(100),
  district        VARCHAR(100),
  village         VARCHAR(100),
  latitude        DECIMAL(9,6) NOT NULL,
  longitude       DECIMAL(9,6) NOT NULL,
  elevation_m     DECIMAL(8,2),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_location_project FOREIGN KEY (project_id) REFERENCES project(id)
);

-- Curated site-selection shortcuts shown in the location picker (Guided
-- Setup step 1 and the Location & Climate screen). Distinct from `location`
-- above, which is a location actually attached to a project.
CREATE TABLE predefined_location (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  slug                     VARCHAR(50) NOT NULL UNIQUE,   -- 'leh', 'pune', ...
  name                     VARCHAR(100) NOT NULL,
  latitude                 DECIMAL(8,5) NOT NULL,
  longitude                DECIMAL(8,5) NOT NULL,
  elevation_m              INT,
  region                   VARCHAR(100),
  category                 VARCHAR(50),                    -- 'Cold desert', 'Gangetic plain', ...
  has_illustrative_profile BOOLEAN NOT NULL DEFAULT FALSE   -- true only for the hand-built demo locations
);

-- One profile per location per data version (demo / user-provided / future
-- live-API-sourced). is_illustrative=TRUE for shipped demo datasets.
CREATE TABLE climate_profile (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  location_id        BIGINT NOT NULL,
  source             VARCHAR(20) NOT NULL
                       CHECK (source IN ('DEMO_ILLUSTRATIVE','USER_PROVIDED','OPEN_METEO','NASA_POWER','ERA5','IMD')),
  -- data_source/api_source/data_validation_status/last_fetched are the
  -- fields the frontend's data-source transparency badge reads from —
  -- every screen showing climate-derived numbers displays this pair.
  data_source        VARCHAR(50) NOT NULL DEFAULT 'DEMO',        -- 'DEMO' | 'OPEN_METEO' | 'USER_PROVIDED' | ...
  api_source         VARCHAR(50),                                 -- e.g. 'open-meteo.com/v1/forecast'
  data_validation_status VARCHAR(20) NOT NULL DEFAULT 'ILLUSTRATIVE'
                       CHECK (data_validation_status IN ('REAL','ILLUSTRATIVE')),
  last_fetched       DATETIME,                                    -- when a live fetch populated this row
  version            VARCHAR(50) NOT NULL,
  is_illustrative    BOOLEAN NOT NULL DEFAULT TRUE,
  ambient_temp_min_c DECIMAL(5,2),
  ambient_temp_max_c DECIMAL(5,2),
  -- Needed by engine.js's estimateGroundTempC() annual fallback — without
  -- this, a DB-backed simulation can never reproduce the reference numbers
  -- computed from a season object that carries avgTempCAnnual directly.
  avg_temp_c_annual  DECIMAL(5,2),
  solar_irradiance_kwh_m2_yr DECIMAL(7,2),
  sunshine_hours_per_day     DECIMAL(4,2),
  avg_wind_speed_ms          DECIMAL(5,2),
  avg_relative_humidity_pct  DECIMAL(5,2),
  avg_cloud_cover_pct        DECIMAL(5,2),
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_climate_profile_location FOREIGN KEY (location_id) REFERENCES location(id)
);

-- 12-row monthly climatology normal, keyed by calendar month (1-12) — the
-- lagged-month path of engine.js's estimateGroundTempC() reads this when
-- present, falling back to avg_temp_c_annual and then to (min+max)/2.
CREATE TABLE climate_profile_monthly (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  climate_profile_id BIGINT NOT NULL,
  month_number       INT NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  avg_temp_c         DECIMAL(5,2) NOT NULL,
  UNIQUE (climate_profile_id, month_number),
  CONSTRAINT fk_cpm_climate_profile FOREIGN KEY (climate_profile_id) REFERENCES climate_profile(id)
);

-- Hourly (or sub-hourly) time series backing a climate_profile.
CREATE TABLE climate_profile_hourly (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  climate_profile_id BIGINT NOT NULL,
  ts_offset_minutes  INT NOT NULL,          -- minutes from simulation start
  ambient_temp_c     DECIMAL(5,2) NOT NULL,
  solar_irradiance_wm2 DECIMAL(7,2) NOT NULL,
  wind_speed_ms      DECIMAL(5,2),
  relative_humidity_pct DECIMAL(5,2),
  CONSTRAINT fk_cph_climate_profile FOREIGN KEY (climate_profile_id) REFERENCES climate_profile(id)
);
CREATE INDEX idx_cph_profile_offset ON climate_profile_hourly (climate_profile_id, ts_offset_minutes);

CREATE TABLE comfort_profile (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL,
  profile_type    VARCHAR(20) NOT NULL
                    CHECK (profile_type IN ('HUMAN_OCCUPANCY','AGRI_PRODUCE','LIVESTOCK','SEED_STORAGE','NURSERY','EQUIPMENT','CUSTOM')),
  name            VARCHAR(255) NOT NULL,
  comfort_min_c   DECIMAL(5,2) NOT NULL,
  comfort_max_c   DECIMAL(5,2) NOT NULL,
  notes           TEXT,
  CONSTRAINT fk_comfort_profile_project FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE TABLE material (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  -- Stable string identifier from app/js/data.js's MATERIALS array (e.g.
  -- 'wall_stone', 'mass_concrete') -- the optimizer's fixed candidate
  -- systems (OptimizationEngine.WALL_SYSTEM_IDS etc.) reference materials by
  -- this slug, not the auto-increment id, so a seeded catalog can resolve
  -- them. Same pattern as predefined_location.slug above.
  slug                VARCHAR(50) NOT NULL UNIQUE,
  category            VARCHAR(20) NOT NULL
                        CHECK (category IN ('WALL','ROOF','FLOOR','INSULATION','THERMAL_MASS','WINDOW')),
  name                VARCHAR(255) NOT NULL,
  density_kg_m3       DECIMAL(8,2),
  thermal_conductivity_w_mk DECIMAL(8,4),
  specific_heat_j_kgk DECIMAL(8,2),
  default_thickness_mm DECIMAL(8,2),
  u_value_w_m2k       DECIMAL(8,4),
  solar_absorptivity  DECIMAL(4,3),
  solar_reflectivity  DECIMAL(4,3),
  emissivity          DECIMAL(4,3),
  shgc                DECIMAL(4,3)  NULL,   -- window materials only
  -- PCM-only (category = THERMAL_MASS materials with pcmMeltC set in
  -- data.js, e.g. mass_pcm/mass_composite). This is the single source of
  -- truth engine.js reads from (massMat.pcmMeltC/pcmLatentJKg) — see
  -- thermal_mass.is_pcm below, which is a derived read-convenience flag
  -- only, never an independent value.
  pcm_melt_temp_c     DECIMAL(5,2) NULL,
  pcm_latent_heat_j_kg DECIMAL(10,2) NULL,
  -- Unit switches with category: per-m2 for WALL/ROOF/FLOOR/INSULATION/
  -- WINDOW, per-kg for THERMAL_MASS (matches data.js costPerM2/costPerKg).
  moisture_notes      VARCHAR(500),
  cost_estimate_inr_per_unit DECIMAL(10,2),
  sustainability_indicator VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
                        CHECK (sustainability_indicator IN ('LOW','MEDIUM','HIGH')),
  is_custom           BOOLEAN NOT NULL DEFAULT FALSE,
  is_engineering_db_value BOOLEAN NOT NULL DEFAULT TRUE, -- "verify for actual construction" flag
  version             VARCHAR(50) NOT NULL DEFAULT '1.0',
  created_by          BIGINT,
  CONSTRAINT fk_material_created_by FOREIGN KEY (created_by) REFERENCES app_user(id)
);

CREATE TABLE shelter_design (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL,
  name            VARCHAR(255) NOT NULL,
  shape           VARCHAR(20) NOT NULL
                    CHECK (shape IN ('RECTANGULAR','SQUARE','CIRCULAR','DOME','SEMI_CIRCULAR','L_SHAPE','CUSTOM')),
  length_m        DECIMAL(6,2),
  width_m         DECIMAL(6,2),
  height_m        DECIMAL(6,2),
  diameter_m      DECIMAL(6,2),
  -- L_SHAPE only — two rectangular wings sharing a corner, see
  -- engine.js computeGeometry's isLShape branch.
  length_a_m      DECIMAL(6,2),
  width_a_m       DECIMAL(6,2),
  length_b_m      DECIMAL(6,2),
  width_b_m       DECIMAL(6,2),
  -- All 8 compass points + CUSTOM (matches engine.js's ORIENT_OFFSET table
  -- and the existing UI dropdown) — the original 4-point set couldn't
  -- represent a SE/SW/NE/NW design.
  orientation     VARCHAR(10) NOT NULL
                    CHECK (orientation IN ('NORTH','SOUTH','EAST','WEST','NE','NW','SE','SW','CUSTOM')),
  azimuth_deg     DECIMAL(5,1),
  floor_area_m2   DECIMAL(8,2),
  volume_m3       DECIMAL(9,2),
  roof_area_m2    DECIMAL(8,2),
  wall_area_m2    DECIMAL(8,2),
  wall_material_id BIGINT,
  wall_thickness_mm DECIMAL(8,2),
  roof_material_id  BIGINT,
  roof_thickness_mm DECIMAL(8,2),
  floor_material_id BIGINT,
  -- floorUValue() reads this directly (defaulting to 150mm otherwise) — was
  -- missing from the original schema entirely.
  floor_thickness_mm DECIMAL(8,2),
  -- Wall and roof insulation are independent in the physics model (the
  -- reference baseline design uses 35mm on the wall vs 69mm on the roof) —
  -- a single shared insulation_material_id/thickness_mm pair (the original
  -- schema's shape) cannot represent that. Two full material+thickness
  -- pairs replace it, matching the schema's existing flat-column style
  -- rather than introducing a separate material_layer join table.
  wall_insulation_material_id BIGINT,
  wall_insulation_thickness_mm DECIMAL(8,2),
  roof_insulation_material_id BIGINT,
  roof_insulation_thickness_mm DECIMAL(8,2),
  air_leakage_ach   DECIMAL(5,2),
  comfort_profile_id BIGINT,
  occupancy_count   INT DEFAULT 0,
  occupancy_activity VARCHAR(20) DEFAULT 'SEATED'
                    CHECK (occupancy_activity IN ('SLEEPING','SEATED','LIGHT','MODERATE','HEAVY')),
  internal_heat_gain_w DECIMAL(8,2) DEFAULT 0,
  ground_temp_c     DECIMAL(5,2) NULL,     -- explicit override; NULL uses estimateGroundTempC()
  version           BIGINT NOT NULL DEFAULT 0, -- optimistic locking (@Version) — interactively edited
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_shelter_design_project FOREIGN KEY (project_id) REFERENCES project(id),
  CONSTRAINT fk_shelter_design_wall_material FOREIGN KEY (wall_material_id) REFERENCES material(id),
  CONSTRAINT fk_shelter_design_roof_material FOREIGN KEY (roof_material_id) REFERENCES material(id),
  CONSTRAINT fk_shelter_design_floor_material FOREIGN KEY (floor_material_id) REFERENCES material(id),
  CONSTRAINT fk_shelter_design_wall_ins_material FOREIGN KEY (wall_insulation_material_id) REFERENCES material(id),
  CONSTRAINT fk_shelter_design_roof_ins_material FOREIGN KEY (roof_insulation_material_id) REFERENCES material(id),
  CONSTRAINT fk_shelter_design_comfort_profile FOREIGN KEY (comfort_profile_id) REFERENCES comfort_profile(id)
);

CREATE TABLE opening (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  shelter_design_id BIGINT NOT NULL,
  opening_type      VARCHAR(10) NOT NULL
                      CHECK (opening_type IN ('WINDOW','DOOR','VENT')),
  count             INT NOT NULL DEFAULT 1,
  area_each_m2      DECIMAL(6,2) NOT NULL,
  -- Stores the engine's own relative-face labels (FRONT/BACK/LEFT/RIGHT
  -- for a rectangular design; CURVED_WALL/L_WALL for the single-face
  -- round/L-shape geometries) rather than compass points — this is what
  -- runSimulation's per-face opening-area matching actually keys on
  -- (openingAreaByFace / solidFaceAreas), so storing compass directions
  -- here would require a lossy compass-to-face translation layer at the
  -- API boundary for no benefit.
  orientation       VARCHAR(15) NOT NULL
                      CHECK (orientation IN ('FRONT','BACK','LEFT','RIGHT','CURVED_WALL','L_WALL')),
  azimuth_deg       DECIMAL(5,1),
  glazing_material_id BIGINT,
  CONSTRAINT fk_opening_shelter_design FOREIGN KEY (shelter_design_id) REFERENCES shelter_design(id),
  CONSTRAINT fk_opening_glazing_material FOREIGN KEY (glazing_material_id) REFERENCES material(id)
);

CREATE TABLE thermal_mass (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  -- The engine models exactly one thermal-mass node per design — a UNIQUE
  -- constraint keeps this table 0..1 rows per design instead of an
  -- unconstrained one-to-many the physics has no way to combine.
  shelter_design_id BIGINT NOT NULL UNIQUE,
  material_id       BIGINT NOT NULL,
  mass_kg           DECIMAL(10,2) NOT NULL,
  surface_area_m2   DECIMAL(8,2) NOT NULL,
  exposure          VARCHAR(10) NOT NULL DEFAULT 'FLOOR'
                      CHECK (exposure IN ('FLOOR','WALL','DEDICATED','BURIED')), -- see config.js THERMAL_MASS_EXPOSURE_H_VALUES
  location_in_shelter VARCHAR(20) DEFAULT 'FLOOR'
                      CHECK (location_in_shelter IN ('FLOOR','WALL_INTERNAL','DEDICATED_MASS_WALL','OTHER')),
  -- Derived read-convenience flag only — the engine always resolves PCM
  -- parameters from the linked Material (material.pcm_melt_temp_c /
  -- pcm_latent_heat_j_kg), never from an instance-level override, so no
  -- pcm_melt_temp_c/pcm_latent_heat_j_kg columns live here (avoids two
  -- sources of truth for the same physics input).
  is_pcm            BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_thermal_mass_shelter_design FOREIGN KEY (shelter_design_id) REFERENCES shelter_design(id),
  CONSTRAINT fk_thermal_mass_material FOREIGN KEY (material_id) REFERENCES material(id)
);

CREATE TABLE simulation (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id          BIGINT NOT NULL,
  shelter_design_id    BIGINT NOT NULL,
  climate_profile_id  BIGINT NOT NULL,
  -- Plain INT, not an enum of '15'/'30'/'60' — those aren't valid Java
  -- enum-constant identifiers. Application-level validation restricts the
  -- value to {15, 30, 60}.
  time_step_minutes   INT NOT NULL DEFAULT 60 CHECK (time_step_minutes IN (15, 30, 60)),
  period_type         VARCHAR(10) NOT NULL
                        CHECK (period_type IN ('24H','7D','30D','SEASONAL','CUSTOM')),
  start_at            DATETIME NOT NULL,
  end_at              DATETIME NOT NULL,
  model_version       VARCHAR(50) NOT NULL DEFAULT '1.0',
  status              VARCHAR(10) NOT NULL DEFAULT 'QUEUED'
                        CHECK (status IN ('QUEUED','RUNNING','COMPLETE','FAILED')),
  run_by              BIGINT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- GET /simulations/{id} needs the aggregate summary (daily energy
  -- balance, comfort stats, scores) runSimulation() computes — stored once
  -- as JSON (same pattern as audit_log's JSON columns) rather than
  -- re-derived from simulation_result's raw rows, which would duplicate
  -- the engine's own aggregation logic outside the engine.
  summary_json        JSON,
  CONSTRAINT fk_simulation_project FOREIGN KEY (project_id) REFERENCES project(id),
  CONSTRAINT fk_simulation_shelter_design FOREIGN KEY (shelter_design_id) REFERENCES shelter_design(id),
  CONSTRAINT fk_simulation_climate_profile FOREIGN KEY (climate_profile_id) REFERENCES climate_profile(id),
  CONSTRAINT fk_simulation_run_by FOREIGN KEY (run_by) REFERENCES app_user(id)
);

CREATE TABLE simulation_result (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  simulation_id   BIGINT NOT NULL,
  ts_offset_minutes INT NOT NULL,
  ambient_temp_c  DECIMAL(5,2),
  indoor_temp_c   DECIMAL(5,2),
  mass_temp_c     DECIMAL(5,2),
  solar_gain_w    DECIMAL(9,2),
  wall_loss_w     DECIMAL(9,2),
  roof_loss_w     DECIMAL(9,2),
  floor_loss_w    DECIMAL(9,2),
  opening_loss_w  DECIMAL(9,2),
  vent_loss_w     DECIMAL(9,2),
  mass_exchange_w DECIMAL(9,2),
  net_balance_w   DECIMAL(9,2),
  in_comfort_band BOOLEAN,
  CONSTRAINT fk_simulation_result_simulation FOREIGN KEY (simulation_id) REFERENCES simulation(id)
);
CREATE INDEX idx_sr_sim_offset ON simulation_result (simulation_id, ts_offset_minutes);

CREATE TABLE optimization_run (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id        BIGINT NOT NULL,
  base_shelter_design_id BIGINT,
  -- The season an optimization run evaluates candidates against —
  -- OptimizationEngine.runOptimization needs a real Season just like a
  -- plain simulation does (discovered while wiring the orchestration
  -- service, not caught at initial schema-design time).
  climate_profile_id BIGINT,
  -- Same simConfig fields `simulation` has, for the same reason: every
  -- candidate the search evaluates is a real runSimulation() call, which
  -- needs a real time step + period, and the chosen values are worth
  -- recording for reproducibility.
  time_step_minutes INT NOT NULL DEFAULT 60 CHECK (time_step_minutes IN (15, 30, 60)),
  period_type       VARCHAR(10) NOT NULL DEFAULT '24H'
                      CHECK (period_type IN ('24H','7D','30D','SEASONAL','CUSTOM')),
  algorithm_version VARCHAR(50) NOT NULL DEFAULT '1.0',
  weight_comfort    DECIMAL(4,3) NOT NULL DEFAULT 0.40,
  weight_retention  DECIMAL(4,3) NOT NULL DEFAULT 0.25,
  weight_solar      DECIMAL(4,3) NOT NULL DEFAULT 0.15,
  weight_energy     DECIMAL(4,3) NOT NULL DEFAULT 0.10,
  weight_cost       DECIMAL(4,3) NOT NULL DEFAULT 0.10,
  candidates_evaluated INT,
  -- Whether a broaderSearch/ML-screened request was honored — always FALSE
  -- in this backend (the deterministic grid search is the only implemented
  -- path; see ARCHITECTURE.md SS9 and backend ml/ package), kept as a real
  -- column so the response contract already matches a future ML-enabled
  -- build without a breaking change.
  used_ml_screening BOOLEAN NOT NULL DEFAULT FALSE,
  status            VARCHAR(10) NOT NULL DEFAULT 'QUEUED'
                      CHECK (status IN ('QUEUED','RUNNING','COMPLETE','FAILED')),
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_optimization_run_project FOREIGN KEY (project_id) REFERENCES project(id),
  CONSTRAINT fk_optimization_run_base_design FOREIGN KEY (base_shelter_design_id) REFERENCES shelter_design(id),
  CONSTRAINT fk_optimization_run_climate_profile FOREIGN KEY (climate_profile_id) REFERENCES climate_profile(id)
);

CREATE TABLE design_candidate (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  optimization_run_id   BIGINT NOT NULL,
  label                 VARCHAR(10) NOT NULL,   -- 'A','B','C',...
  shelter_design_id     BIGINT NOT NULL,
  -- NULL for the vast majority of the 567 evaluated candidates — the
  -- optimizer never persists a full Simulation+SimulationResult graph per
  -- candidate (matching the JS engine, which discards each candidate's
  -- hourly series immediately after scoring). Only set for a candidate a
  -- user explicitly promotes to a real, inspectable simulation.
  simulation_id         BIGINT,
  comfort_score         DECIMAL(5,2),
  retention_score       DECIMAL(5,2),
  solar_score           DECIMAL(5,2),
  energy_score          DECIMAL(5,2),
  cost_score            DECIMAL(5,2),
  weighted_total_score  DECIMAL(5,2),
  estimated_cost_inr    DECIMAL(12,2),
  is_recommended        BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_design_candidate_run FOREIGN KEY (optimization_run_id) REFERENCES optimization_run(id),
  CONSTRAINT fk_design_candidate_shelter_design FOREIGN KEY (shelter_design_id) REFERENCES shelter_design(id),
  CONSTRAINT fk_design_candidate_simulation FOREIGN KEY (simulation_id) REFERENCES simulation(id)
);

CREATE TABLE validation_dataset (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL,
  shelter_design_id BIGINT,
  name            VARCHAR(255) NOT NULL,
  uploaded_by     BIGINT,
  uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mae_c           DECIMAL(6,3),
  rmse_c          DECIMAL(6,3),
  mape_pct        DECIMAL(6,3),
  r2              DECIMAL(6,4),
  CONSTRAINT fk_validation_dataset_project FOREIGN KEY (project_id) REFERENCES project(id),
  CONSTRAINT fk_validation_dataset_shelter_design FOREIGN KEY (shelter_design_id) REFERENCES shelter_design(id),
  CONSTRAINT fk_validation_dataset_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES app_user(id)
);

CREATE TABLE validation_dataset_point (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  validation_dataset_id BIGINT NOT NULL,
  ts                    DATETIME NOT NULL,
  ambient_temp_c        DECIMAL(5,2),
  measured_indoor_temp_c DECIMAL(5,2) NOT NULL,
  predicted_indoor_temp_c DECIMAL(5,2),
  solar_radiation_wm2   DECIMAL(7,2),
  wind_speed_ms         DECIMAL(5,2),
  relative_humidity_pct DECIMAL(5,2),
  CONSTRAINT fk_vdp_validation_dataset FOREIGN KEY (validation_dataset_id) REFERENCES validation_dataset(id)
);

CREATE TABLE report (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL,
  simulation_id   BIGINT,
  optimization_run_id BIGINT,
  title           VARCHAR(255) NOT NULL DEFAULT 'Area-Specific Passive Shelter Thermal Performance & Design Optimization Report',
  model_version   VARCHAR(50) NOT NULL,
  generated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by    BIGINT,
  file_path       VARCHAR(500),
  CONSTRAINT fk_report_project FOREIGN KEY (project_id) REFERENCES project(id),
  CONSTRAINT fk_report_simulation FOREIGN KEY (simulation_id) REFERENCES simulation(id),
  CONSTRAINT fk_report_optimization_run FOREIGN KEY (optimization_run_id) REFERENCES optimization_run(id),
  CONSTRAINT fk_report_generated_by FOREIGN KEY (generated_by) REFERENCES app_user(id)
);

CREATE TABLE audit_log (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity_name     VARCHAR(100) NOT NULL,
  entity_id       BIGINT NOT NULL,
  action          VARCHAR(10) NOT NULL
                    CHECK (action IN ('CREATE','UPDATE','DELETE')),
  actor_id        BIGINT,
  before_json     JSON,
  after_json      JSON,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_log_actor FOREIGN KEY (actor_id) REFERENCES app_user(id)
);
CREATE INDEX idx_audit_entity ON audit_log (entity_name, entity_id);
