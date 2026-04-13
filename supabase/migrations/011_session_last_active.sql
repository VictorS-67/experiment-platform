-- Track session activity for token expiry
ALTER TABLE participants ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();

-- Backfill existing rows
UPDATE participants SET last_active_at = registered_at WHERE last_active_at IS NULL;
