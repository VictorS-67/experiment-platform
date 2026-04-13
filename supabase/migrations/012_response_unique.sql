-- Prevent duplicate responses for the same stimulus/phase/participant/index
CREATE UNIQUE INDEX IF NOT EXISTS responses_unique_idx
ON responses (participant_id, phase_id, stimulus_id, response_index);
