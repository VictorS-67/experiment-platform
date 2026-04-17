-- Rotate every participant session token.
--
-- Context: a local backup file (backup-2026-03-22.json) containing participant
-- session tokens could have been exposed. Rotating every token to a fresh
-- UUID makes any cached/leaked cookie useless — the holder will no longer
-- match a row in `participants` and will fall back to the email lookup flow
-- on next visit.
--
-- We rotate (rather than NULL the column) because participants.session_token
-- is NOT NULL with a gen_random_uuid() default (migration 004).

UPDATE participants SET session_token = gen_random_uuid();
