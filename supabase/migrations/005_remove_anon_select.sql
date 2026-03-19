-- Migration: Remove anon SELECT access from sensitive tables
-- All data access is now server-side (service role key bypasses RLS).
-- The anon key must NOT be able to read participant or response data.

-- ─── participants ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Read participants scoped to experiment" ON participants;

-- ─── responses ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Read responses scoped to experiment" ON responses;

-- ─── file_uploads ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Read file uploads scoped to experiment" ON file_uploads;

-- experiments remains readable by anon (layout server uses anon key to load active configs)
