-- Normalize legacy skip rows in responses.response_data.
--
-- Before the gatekeeper "No" handler was updated (see phase-controls fix), skip
-- rows were written with a configurable string sentinel (default "null") in every
-- widget key, e.g. {"w1": "null", "w2": "null"}.  After the fix, they are written
-- with JSON null per key, e.g. {"w1": null, "w2": null}.
--
-- This function detects and rewrites legacy sentinel rows for one experiment so
-- that the dataset is uniform (all skip rows use JSON null).  It is safe to run
-- multiple times: post-rewrite rows fail the detection heuristic and are ignored.
--
-- Detection heuristic (sentinel-agnostic — does not read noResponseValue from the
-- config):
--   A row is a skip candidate when:
--     1. response_data has >= 2 keys (single-widget phases excluded — too risky).
--     2. Every value is a non-null JSON primitive (string or number).
--     3. All values are equal to each other (same sentinel across all widgets).
--
-- False-positive risk: a participant who typed identical answers in every widget.
-- Mitigations: the calling script logs all detected rows for human review before
-- committing any writes, and supports an --exclude flag per experiment.
--
-- Parameters:
--   exp_id  UUID of the experiment whose responses to normalize.
--
-- Returns:
--   JSONB with {rows_rewritten: integer}.

CREATE OR REPLACE FUNCTION normalize_skip_rows_for_experiment(
    exp_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    rows_rewritten integer := 0;
    null_data      jsonb;
    rec            record;
BEGIN
    FOR rec IN
        SELECT r.id, r.response_data
        FROM responses r
        WHERE r.experiment_id = exp_id
          -- Must have >= 2 keys
          AND jsonb_typeof(r.response_data) = 'object'
          AND (SELECT count(*) FROM jsonb_object_keys(r.response_data)) >= 2
          -- Every value must be a non-null primitive
          AND NOT EXISTS (
              SELECT 1
              FROM jsonb_each(r.response_data) kv
              WHERE jsonb_typeof(kv.value) NOT IN ('string', 'number')
          )
          -- All values equal (single distinct value)
          AND (
              SELECT count(DISTINCT kv.value)
              FROM jsonb_each(r.response_data) kv
          ) = 1
    LOOP
        -- Build a replacement object with the same keys, all set to JSON null.
        SELECT jsonb_object_agg(key, 'null'::jsonb)
        INTO null_data
        FROM jsonb_object_keys(rec.response_data) key;

        UPDATE responses
        SET response_data = null_data
        WHERE id = rec.id;

        rows_rewritten := rows_rewritten + 1;
    END LOOP;

    RETURN jsonb_build_object('rows_rewritten', rows_rewritten);
END;
$$;
