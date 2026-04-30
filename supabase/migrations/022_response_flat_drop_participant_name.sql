-- Drop participant_name from response_flat view.
-- The column was registration_data->>'name', which duplicates reg_name when
-- registration flattening is enabled in the CSV export. The export already
-- omits it (see export/+server.ts). Removing it here keeps the view consistent
-- with what the application actually reads.
--
-- Depends on: export/+server.ts no longer referencing participant_name (shipped
-- in the same release as this migration).

DROP VIEW IF EXISTS response_flat;

CREATE VIEW response_flat WITH (security_invoker = true) AS
SELECT
  r.id,
  e.slug AS experiment_slug,
  p.email AS participant_email,
  r.phase_id,
  r.stimulus_id,
  r.response_data,
  r.response_index,
  r.created_at,
  r.updated_at
FROM responses r
JOIN experiments e ON e.id = r.experiment_id
JOIN participants p ON p.id = r.participant_id;
