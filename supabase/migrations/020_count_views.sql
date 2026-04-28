-- DB-side aggregate views for admin dashboard counts.
--
-- Replaces the previous in-memory loops that loaded every participant / every
-- response row just to count them client-side. With these views, each
-- dashboard load does one indexed aggregate scan instead of O(n) row transfer.
--
-- Views are `security_invoker = true` so they inherit the caller's RLS —
-- service-role callers see everything, anon sees nothing.

CREATE OR REPLACE VIEW experiment_participant_counts
WITH (security_invoker = true) AS
SELECT
  experiment_id,
  COUNT(*)::integer AS participant_count
FROM participants
GROUP BY experiment_id;

CREATE OR REPLACE VIEW participant_response_counts
WITH (security_invoker = true) AS
SELECT
  participant_id,
  COUNT(*)::integer AS response_count
FROM responses
GROUP BY participant_id;

-- Per-(experiment, phase) participant counts — powers getExperimentStats
-- without pulling every response row.
CREATE OR REPLACE VIEW phase_participant_counts
WITH (security_invoker = true) AS
SELECT
  experiment_id,
  phase_id,
  COUNT(DISTINCT participant_id)::integer AS participants_started
FROM responses
GROUP BY experiment_id, phase_id;

-- Per-(experiment, stimulus) response counts — same idea for the stimulus
-- distribution chart.
CREATE OR REPLACE VIEW stimulus_response_counts
WITH (security_invoker = true) AS
SELECT
  experiment_id,
  stimulus_id,
  COUNT(*)::integer AS response_count
FROM responses
GROUP BY experiment_id, stimulus_id;
