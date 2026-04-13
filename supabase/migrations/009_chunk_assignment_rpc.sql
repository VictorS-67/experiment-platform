-- Atomic chunk assignment update using jsonb_set to avoid read-modify-write race conditions
CREATE OR REPLACE FUNCTION set_chunk_assignment(p_id uuid, chunk_key text, assignment jsonb)
RETURNS void AS $$
  UPDATE participants
  SET chunk_assignments = jsonb_set(
    COALESCE(chunk_assignments, '{}'),
    ARRAY[chunk_key],
    assignment
  )
  WHERE id = p_id;
$$ LANGUAGE sql;
