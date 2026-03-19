-- Enable Row Level Security on all tables
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;

-- ─── experiments ──────────────────────────────────────────────
-- Anyone can read active experiments (needed to load the survey page)
CREATE POLICY "Public can read active experiments"
  ON experiments FOR SELECT
  USING (status = 'active');

-- ─── participants ─────────────────────────────────────────────
-- Anyone can register as a participant (INSERT)
CREATE POLICY "Public can register"
  ON participants FOR INSERT
  WITH CHECK (true);

-- Anyone can look up a participant by email (needed for returning participant login)
CREATE POLICY "Public can look up participant by email"
  ON participants FOR SELECT
  USING (true);

-- ─── responses ────────────────────────────────────────────────
-- Anyone can submit a response
CREATE POLICY "Public can submit responses"
  ON responses FOR INSERT
  WITH CHECK (true);

-- Anyone can read responses (needed to load a participant's previous answers on return)
CREATE POLICY "Public can read responses"
  ON responses FOR SELECT
  USING (true);

-- Anyone can update responses (needed for the reasoning phase: updating existing rows)
CREATE POLICY "Public can update responses"
  ON responses FOR UPDATE
  USING (true);

-- ─── file_uploads ──────────────────────────────────────────────
-- Anyone can insert file upload records
CREATE POLICY "Public can insert file uploads"
  ON file_uploads FOR INSERT
  WITH CHECK (true);

-- Anyone can read file upload records
CREATE POLICY "Public can read file uploads"
  ON file_uploads FOR SELECT
  USING (true);
