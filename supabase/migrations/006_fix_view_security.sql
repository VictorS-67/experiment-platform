-- Fix: Remove SECURITY DEFINER from response_flat view
-- The view was implicitly created with SECURITY DEFINER.
-- Since it's only queried server-side via the service role client,
-- SECURITY INVOKER is the correct (and safer) setting.

DROP VIEW IF EXISTS response_flat;

CREATE VIEW response_flat WITH (security_invoker = true) AS
SELECT
  r.id,
  e.slug AS experiment_slug,
  p.email AS participant_email,
  p.registration_data->>'name' AS participant_name,
  r.phase_id,
  r.stimulus_id,
  r.response_data,
  r.response_index,
  r.created_at,
  r.updated_at
FROM responses r
JOIN experiments e ON e.id = r.experiment_id
JOIN participants p ON p.id = r.participant_id;
