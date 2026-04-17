-- Atomic "save config" operation: inserts the next config version AND updates
-- the live experiments.config in a single transaction, returning the new
-- version number and the new experiments.updated_at timestamp (used by the
-- admin config editor for optimistic-locking conflict detection).
--
-- This replaces the previous two-step pattern:
--   await saveConfigVersion(id, cfg);        -- insert row in experiment_config_versions
--   await updateExperiment(id, { config });  -- update experiments.config
-- which could leave the version history and the live config out of sync if
-- the second step failed after the first succeeded.
--
-- If expected_updated_at is non-null, the function aborts when the row's
-- current updated_at does not match — that's the optimistic-lock check used
-- by the config editor to detect concurrent edits.

CREATE OR REPLACE FUNCTION upsert_config_with_version(
    exp_id uuid,
    cfg jsonb,
    new_slug text DEFAULT NULL,
    expected_updated_at timestamptz DEFAULT NULL
)
RETURNS TABLE (version_number integer, updated_at timestamptz) AS $$
DECLARE
    next_ver integer;
    current_updated_at timestamptz;
    new_updated_at timestamptz;
BEGIN
    -- Lock the experiment row for the duration of this transaction so
    -- concurrent callers serialize instead of racing.
    SELECT experiments.updated_at INTO current_updated_at
    FROM experiments
    WHERE experiments.id = exp_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'experiment not found: %', exp_id USING ERRCODE = 'P0002';
    END IF;

    IF expected_updated_at IS NOT NULL AND current_updated_at <> expected_updated_at THEN
        RAISE EXCEPTION 'config was modified by another admin since you loaded it (expected %, found %)',
            expected_updated_at, current_updated_at
            USING ERRCODE = 'P0004';
    END IF;

    SELECT COALESCE(MAX(v.version_number), 0) + 1 INTO next_ver
    FROM experiment_config_versions v
    WHERE v.experiment_id = exp_id;

    INSERT INTO experiment_config_versions (experiment_id, version_number, config)
    VALUES (exp_id, next_ver, cfg);

    new_updated_at := NOW();
    UPDATE experiments
    SET config = cfg,
        slug = COALESCE(new_slug, experiments.slug),
        updated_at = new_updated_at
    WHERE experiments.id = exp_id;

    RETURN QUERY SELECT next_ver, new_updated_at;
END;
$$ LANGUAGE plpgsql;
