-- Atomic config version numbering to avoid race conditions
CREATE OR REPLACE FUNCTION insert_config_version(exp_id uuid, cfg jsonb)
RETURNS integer AS $$
DECLARE
    next_ver integer;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_ver
    FROM experiment_config_versions
    WHERE experiment_id = exp_id;

    INSERT INTO experiment_config_versions (experiment_id, version_number, config)
    VALUES (exp_id, next_ver, cfg);

    RETURN next_ver;
END;
$$ LANGUAGE plpgsql;
