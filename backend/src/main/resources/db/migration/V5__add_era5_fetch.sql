-- Caches one ERA5 (Copernicus CDS) retrieval per (rounded lat, rounded lon,
-- year, month), shared across all users -- see Era5Fetch's javadoc. Not
-- scoped to a project or shelter design.
CREATE TABLE era5_fetch (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  latitude       DECIMAL(6,2) NOT NULL,
  longitude      DECIMAL(6,2) NOT NULL,
  fetch_year     INT NOT NULL CHECK (fetch_year BETWEEN 1950 AND 2100),
  fetch_month    INT NOT NULL CHECK (fetch_month BETWEEN 1 AND 12),
  status         VARCHAR(10) NOT NULL DEFAULT 'QUEUED'
                   CHECK (status IN ('QUEUED','RUNNING','COMPLETE','FAILED')),
  cds_job_id     VARCHAR(100),
  result_json    JSON,
  error_message  VARCHAR(1000),
  created_at     TIMESTAMP NOT NULL,
  completed_at   TIMESTAMP,
  CONSTRAINT uq_era5_fetch_point_month UNIQUE (latitude, longitude, fetch_year, fetch_month)
);
