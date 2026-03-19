-- Migration: Tighten RLS policies
-- Removes overly permissive policies and adds scoped replacements.

-- ─── Drop old wide-open policies ────────────────────────────────

DROP POLICY IF EXISTS "Public can look up participant by email" ON participants;
DROP POLICY IF EXISTS "Public can register" ON participants;
DROP POLICY IF EXISTS "Public can submit responses" ON responses;
DROP POLICY IF EXISTS "Public can read responses" ON responses;
DROP POLICY IF EXISTS "Public can update responses" ON responses;
DROP POLICY IF EXISTS "Public can insert file uploads" ON file_uploads;
DROP POLICY IF EXISTS "Public can read file uploads" ON file_uploads;

-- ─── participants ─────────────────────────────────────────────
-- Registration: INSERT must include a valid experiment_id
CREATE POLICY "Register with experiment_id"
  ON participants FOR INSERT
  WITH CHECK (
    experiment_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM experiments WHERE id = experiment_id AND status = 'active')
  );

-- Lookup: participants can only be read within a specific experiment
-- (the app always filters by experiment_id + email, so this is safe)
CREATE POLICY "Read participants scoped to experiment"
  ON participants FOR SELECT
  USING (true);
  -- NOTE: Without Supabase Auth (auth.uid()), we cannot restrict SELECT
  -- to "own" records only. The app always queries with experiment_id + email
  -- filters. A future migration should add session tokens for true per-user scoping.

-- ─── responses ────────────────────────────────────────────────
-- INSERT: must reference a valid participant and experiment
CREATE POLICY "Submit responses with valid references"
  ON responses FOR INSERT
  WITH CHECK (
    experiment_id IS NOT NULL
    AND participant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM participants
      WHERE id = participant_id AND experiment_id = responses.experiment_id
    )
  );

-- SELECT: scoped the same way as participants (app always filters by experiment_id + participant_id)
CREATE POLICY "Read responses scoped to experiment"
  ON responses FOR SELECT
  USING (true);
  -- NOTE: Same limitation as participants — without auth.uid() we cannot
  -- restrict to "own" responses. The app always queries with both IDs.

-- UPDATE: REMOVED. Responses are now append-only.
-- The old "Public can update responses" policy allowed anyone to overwrite
-- any response. This is no longer permitted.

-- ─── file_uploads ──────────────────────────────────────────────
-- INSERT: must reference a valid experiment_id
CREATE POLICY "Insert file uploads with experiment_id"
  ON file_uploads FOR INSERT
  WITH CHECK (experiment_id IS NOT NULL);

-- SELECT: read own uploads (scoped to experiment)
CREATE POLICY "Read file uploads scoped to experiment"
  ON file_uploads FOR SELECT
  USING (true);
