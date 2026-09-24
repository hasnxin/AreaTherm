ALTER TABLE app_user ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_user ADD COLUMN verification_code VARCHAR(10);
ALTER TABLE app_user ADD COLUMN verification_code_expires_at DATETIME;
