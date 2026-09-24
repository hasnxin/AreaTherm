-- Optional hour-indexed occupancy alternative to shelter_design's flat
-- occupancy_count/occupancy_activity columns. 0 or 24 rows per design --
-- 0 means "use the flat pair for the whole run", exactly as before this
-- table existed. Same child-table shape as thermal_mass/opening, not a
-- single JSON column, for consistency with how this schema already
-- persists per-hour data (see climate_profile_hourly).
CREATE TABLE occupancy_schedule_hour (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  shelter_design_id   BIGINT NOT NULL,
  hour_of_day         INT NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  occupancy_count     INT NOT NULL CHECK (occupancy_count >= 0),
  occupancy_activity  VARCHAR(20) NOT NULL
                        CHECK (occupancy_activity IN ('SLEEPING','SEATED','LIGHT','MODERATE','HEAVY')),
  CONSTRAINT fk_osh_shelter_design FOREIGN KEY (shelter_design_id) REFERENCES shelter_design(id)
);

CREATE INDEX idx_osh_design_hour ON occupancy_schedule_hour(shelter_design_id, hour_of_day);
