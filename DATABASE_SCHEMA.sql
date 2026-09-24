-- =====================================================================
-- AreaTherm — Target production schema (MySQL 8)
-- Mirrors the entities the prototype keeps in app/js/store.js so a real
-- Spring Boot backend can be swapped in without a data-model redesign.
-- Not deployed in this environment (no MySQL/Docker installed here) —
-- provided as the production target described in ARCHITECTURE.md.
-- =====================================================================

CREATE TABLE app_user (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  display_name    VARCHAR(255) NOT NULL,
  role            ENUM('ADMIN','RESEARCHER','ENGINEER','VIEWER') NOT NULL DEFAULT 'ENGINEER',
  password_hash   VARCHAR(255) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_id        BIGINT NOT NULL REFERENCES app_user(id),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE location (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES project(id),
  country         VARCHAR(100) NOT NULL DEFAULT 'India',
  state           VARCHAR(100),
  district        VARCHAR(100),
  village         VARCHAR(100),
  latitude        DECIMAL(9,6) NOT NULL,
  longitude       DECIMAL(9,6) NOT NULL,
  elevation_m     DECIMAL(8,2),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  location_id        BIGINT NOT NULL REFERENCES location(id),
  source             ENUM('DEMO_ILLUSTRATIVE','USER_PROVIDED','OPEN_METEO','NASA_POWER','ERA5','IMD') NOT NULL,
  -- data_source/api_source/data_validation_status/last_fetched are the
  -- fields the frontend's data-source transparency badge reads from —
  -- every screen showing climate-derived numbers displays this pair.
  data_source        VARCHAR(50) NOT NULL DEFAULT 'DEMO',        -- 'DEMO' | 'OPEN_METEO' | 'USER_PROVIDED' | ...
  api_source         VARCHAR(50),                                 -- e.g. 'open-meteo.com/v1/forecast'
  data_validation_status ENUM('REAL','ILLUSTRATIVE') NOT NULL DEFAULT 'ILLUSTRATIVE',
  last_fetched       DATETIME,                                    -- when a live fetch populated this row
  version            VARCHAR(50) NOT NULL,
  is_illustrative    BOOLEAN NOT NULL DEFAULT TRUE,
  ambient_temp_min_c DECIMAL(5,2),
  ambient_temp_max_c DECIMAL(5,2),
  solar_irradiance_kwh_m2_yr DECIMAL(7,2),
  sunshine_hours_per_day     DECIMAL(4,2),
  avg_wind_speed_ms          DECIMAL(5,2),
  avg_relative_humidity_pct  DECIMAL(5,2),
  avg_cloud_cover_pct        DECIMAL(5,2),
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hourly (or sub-hourly) time series backing a climate_profile.
CREATE TABLE climate_profile_hourly (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  climate_profile_id BIGINT NOT NULL REFERENCES climate_profile(id),
  ts_offset_minutes  INT NOT NULL,          -- minutes from simulation start
  ambient_temp_c     DECIMAL(5,2) NOT NULL,
  solar_irradiance_wm2 DECIMAL(7,2) NOT NULL,
  wind_speed_ms      DECIMAL(5,2),
  relative_humidity_pct DECIMAL(5,2),
  INDEX idx_cph_profile_offset (climate_profile_id, ts_offset_minutes)
);

CREATE TABLE comfort_profile (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES project(id),
  profile_type    ENUM('HUMAN_OCCUPANCY','AGRI_PRODUCE','LIVESTOCK','SEED_STORAGE','NURSERY','EQUIPMENT','CUSTOM') NOT NULL,
  name            VARCHAR(255) NOT NULL,
  comfort_min_c   DECIMAL(5,2) NOT NULL,
  comfort_max_c   DECIMAL(5,2) NOT NULL,
  notes           TEXT
);

CREATE TABLE material (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  category            ENUM('WALL','ROOF','FLOOR','INSULATION','THERMAL_MASS','WINDOW') NOT NULL,
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
  moisture_notes      VARCHAR(500),
  cost_estimate_inr_per_unit DECIMAL(10,2),
  sustainability_indicator ENUM('LOW','MEDIUM','HIGH') DEFAULT 'MEDIUM',
  is_custom           BOOLEAN NOT NULL DEFAULT FALSE,
  is_engineering_db_value BOOLEAN NOT NULL DEFAULT TRUE, -- "verify for actual construction" flag
  version             VARCHAR(50) NOT NULL DEFAULT '1.0',
  created_by          BIGINT REFERENCES app_user(id)
);

CREATE TABLE shelter_design (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES project(id),
  name            VARCHAR(255) NOT NULL,
  shape           ENUM('RECTANGULAR','SQUARE','CIRCULAR','DOME','SEMI_CIRCULAR','CUSTOM') NOT NULL,
  length_m        DECIMAL(6,2),
  width_m         DECIMAL(6,2),
  height_m        DECIMAL(6,2),
  diameter_m      DECIMAL(6,2),
  orientation     ENUM('NORTH','SOUTH','EAST','WEST','CUSTOM') NOT NULL,
  azimuth_deg     DECIMAL(5,1),
  floor_area_m2   DECIMAL(8,2),
  volume_m3       DECIMAL(9,2),
  roof_area_m2    DECIMAL(8,2),
  wall_area_m2    DECIMAL(8,2),
  wall_material_id BIGINT REFERENCES material(id),
  wall_thickness_mm DECIMAL(8,2),
  roof_material_id  BIGINT REFERENCES material(id),
  roof_thickness_mm DECIMAL(8,2),
  floor_material_id BIGINT REFERENCES material(id),
  insulation_material_id BIGINT REFERENCES material(id),
  insulation_thickness_mm DECIMAL(8,2),
  air_leakage_ach   DECIMAL(5,2),
  comfort_profile_id BIGINT REFERENCES comfort_profile(id),
  occupancy_count   INT DEFAULT 0,
  internal_heat_gain_w DECIMAL(8,2) DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE opening (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  shelter_design_id BIGINT NOT NULL REFERENCES shelter_design(id),
  opening_type      ENUM('WINDOW','DOOR','VENT') NOT NULL,
  count             INT NOT NULL DEFAULT 1,
  area_each_m2      DECIMAL(6,2) NOT NULL,
  orientation       ENUM('NORTH','SOUTH','EAST','WEST','CUSTOM') NOT NULL,
  azimuth_deg       DECIMAL(5,1),
  glazing_material_id BIGINT REFERENCES material(id)
);

CREATE TABLE thermal_mass (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  shelter_design_id BIGINT NOT NULL REFERENCES shelter_design(id),
  material_id       BIGINT NOT NULL REFERENCES material(id),
  mass_kg           DECIMAL(10,2) NOT NULL,
  surface_area_m2   DECIMAL(8,2) NOT NULL,
  location_in_shelter ENUM('FLOOR','WALL_INTERNAL','DEDICATED_MASS_WALL','OTHER') DEFAULT 'FLOOR',
  is_pcm            BOOLEAN NOT NULL DEFAULT FALSE,
  pcm_melt_temp_c   DECIMAL(5,2) NULL,
  pcm_latent_heat_j_kg DECIMAL(10,2) NULL
);

CREATE TABLE simulation (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id          BIGINT NOT NULL REFERENCES project(id),
  shelter_design_id    BIGINT NOT NULL REFERENCES shelter_design(id),
  climate_profile_id  BIGINT NOT NULL REFERENCES climate_profile(id),
  time_step_minutes   ENUM('15','30','60') NOT NULL DEFAULT '60',
  period_type         ENUM('24H','7D','30D','SEASONAL','CUSTOM') NOT NULL,
  start_at            DATETIME NOT NULL,
  end_at              DATETIME NOT NULL,
  model_version       VARCHAR(50) NOT NULL DEFAULT '1.0',
  status              ENUM('QUEUED','RUNNING','COMPLETE','FAILED') NOT NULL DEFAULT 'QUEUED',
  run_by              BIGINT REFERENCES app_user(id),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE simulation_result (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  simulation_id   BIGINT NOT NULL REFERENCES simulation(id),
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
  INDEX idx_sr_sim_offset (simulation_id, ts_offset_minutes)
);

CREATE TABLE optimization_run (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id        BIGINT NOT NULL REFERENCES project(id),
  base_shelter_design_id BIGINT REFERENCES shelter_design(id),
  algorithm_version VARCHAR(50) NOT NULL DEFAULT '1.0',
  weight_comfort    DECIMAL(4,3) NOT NULL DEFAULT 0.40,
  weight_retention  DECIMAL(4,3) NOT NULL DEFAULT 0.25,
  weight_solar      DECIMAL(4,3) NOT NULL DEFAULT 0.15,
  weight_energy     DECIMAL(4,3) NOT NULL DEFAULT 0.10,
  weight_cost       DECIMAL(4,3) NOT NULL DEFAULT 0.10,
  candidates_evaluated INT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE design_candidate (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  optimization_run_id   BIGINT NOT NULL REFERENCES optimization_run(id),
  label                 VARCHAR(10) NOT NULL,   -- 'A','B','C',...
  shelter_design_id     BIGINT NOT NULL REFERENCES shelter_design(id),
  simulation_id         BIGINT REFERENCES simulation(id),
  comfort_score         DECIMAL(5,2),
  retention_score       DECIMAL(5,2),
  solar_score           DECIMAL(5,2),
  energy_score          DECIMAL(5,2),
  cost_score            DECIMAL(5,2),
  weighted_total_score  DECIMAL(5,2),
  estimated_cost_inr    DECIMAL(12,2),
  is_recommended        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE validation_dataset (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES project(id),
  shelter_design_id BIGINT REFERENCES shelter_design(id),
  name            VARCHAR(255) NOT NULL,
  uploaded_by     BIGINT REFERENCES app_user(id),
  uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mae_c           DECIMAL(6,3),
  rmse_c          DECIMAL(6,3),
  mape_pct        DECIMAL(6,3),
  r2              DECIMAL(6,4)
);

CREATE TABLE validation_dataset_point (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  validation_dataset_id BIGINT NOT NULL REFERENCES validation_dataset(id),
  ts                    DATETIME NOT NULL,
  ambient_temp_c        DECIMAL(5,2),
  measured_indoor_temp_c DECIMAL(5,2) NOT NULL,
  predicted_indoor_temp_c DECIMAL(5,2),
  solar_radiation_wm2   DECIMAL(7,2),
  wind_speed_ms         DECIMAL(5,2),
  relative_humidity_pct DECIMAL(5,2)
);

CREATE TABLE report (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES project(id),
  simulation_id   BIGINT REFERENCES simulation(id),
  optimization_run_id BIGINT REFERENCES optimization_run(id),
  title           VARCHAR(255) NOT NULL DEFAULT 'Area-Specific Passive Shelter Thermal Performance & Design Optimization Report',
  model_version   VARCHAR(50) NOT NULL,
  generated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by    BIGINT REFERENCES app_user(id),
  file_path       VARCHAR(500)
);

CREATE TABLE audit_log (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity_name     VARCHAR(100) NOT NULL,
  entity_id       BIGINT NOT NULL,
  action          ENUM('CREATE','UPDATE','DELETE') NOT NULL,
  actor_id        BIGINT REFERENCES app_user(id),
  before_json     JSON,
  after_json      JSON,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_name, entity_id)
);
