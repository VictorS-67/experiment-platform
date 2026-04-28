-- Track when each participant's session token was last rotated.
--
-- Per the security decision (24h activity-based rotation): if a participant's
-- token is older than 24h since the last rotation, the server issues a fresh
-- token on the next request. Limits exposure window if a token leaks.

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMPTZ DEFAULT now();

-- Existing rows: treat the registration time as the last rotation so older
-- sessions get rotated on the next request.
UPDATE participants
SET last_rotated_at = registered_at
WHERE last_rotated_at IS NULL;
