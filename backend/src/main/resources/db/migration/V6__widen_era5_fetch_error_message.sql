-- A real CDS error response can be a multi-hundred-character JSON/HTML body
-- (see Era5Client's error formatting) -- 1000 chars was too tight and caused
-- a secondary failure (truncation) that masked the real underlying error.
ALTER TABLE era5_fetch ALTER COLUMN error_message VARCHAR(4000);
