-- Migration: Add session tokens for secure participant authentication
-- Uses a UUID token stored in an httpOnly cookie instead of localStorage PII

ALTER TABLE participants
  ADD COLUMN session_token UUID DEFAULT gen_random_uuid();

-- Ensure unique session tokens
CREATE UNIQUE INDEX idx_participants_session_token ON participants(session_token);

-- Update existing rows to have unique tokens
UPDATE participants SET session_token = gen_random_uuid() WHERE session_token IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE participants ALTER COLUMN session_token SET NOT NULL;
