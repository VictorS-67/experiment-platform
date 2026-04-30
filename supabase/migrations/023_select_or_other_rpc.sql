-- Atomic config + data migration for the select-or-other field type.
--
-- Given a `select` parent field and a conditional `text` child field, this
-- function:
--   1. Rewrites the config: merges the two fields into a single
--      `select-or-other` field (parent id kept, child dropped).
--   2. Rewrites participant registration_data: participants who picked the
--      "Other" option get their parent key set to the child's typed value;
--      participants who didn't pick Other just have the child key dropped.
--   3. Saves a new config version row and bumps experiments.updated_at.
--   4. Inserts an admin_audit_log row.
--
-- All four steps run in a single transaction (Postgres guarantees this for
-- PL/pgSQL functions). Idempotent: if the parent field is already type
-- 'select-or-other', the function raises an exception rather than
-- double-migrating.
--
-- Parameters:
--   exp_id           UUID of the experiment to migrate.
--   parent_field_id  ID of the select field (will become select-or-other).
--   child_field_id   ID of the conditional text field (will be removed).
--   operator_email   Optional email written to admin_audit_log.
--
-- Returns a JSONB summary: {participants_updated, config_version,
--                           other_option_value}.

CREATE OR REPLACE FUNCTION migrate_select_or_other_for_experiment(
    exp_id         uuid,
    parent_field_id text,
    child_field_id  text,
    operator_email  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    exp_config           jsonb;
    fields               jsonb;
    parent_field         jsonb;
    child_field          jsonb;
    other_option_value   text;
    other_option_label   jsonb;
    new_field            jsonb;
    new_fields           jsonb;
    next_ver             integer;
    new_updated_at       timestamptz;
    participants_updated integer;
BEGIN
    -- Lock the experiment row for the duration of this transaction.
    SELECT config INTO exp_config
    FROM experiments
    WHERE id = exp_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'experiment not found: %', exp_id;
    END IF;

    fields := exp_config -> 'registration' -> 'fields';
    IF fields IS NULL OR jsonb_typeof(fields) != 'array' THEN
        RAISE EXCEPTION 'experiment % has no registration.fields array', exp_id;
    END IF;

    -- Locate parent and child fields.
    SELECT elem INTO parent_field
    FROM jsonb_array_elements(fields) elem
    WHERE elem ->> 'id' = parent_field_id
    LIMIT 1;

    IF parent_field IS NULL THEN
        RAISE EXCEPTION 'parent field "%" not found in experiment %', parent_field_id, exp_id;
    END IF;

    IF parent_field ->> 'type' = 'select-or-other' THEN
        RAISE EXCEPTION 'field "%" is already type select-or-other — already migrated?', parent_field_id;
    END IF;

    SELECT elem INTO child_field
    FROM jsonb_array_elements(fields) elem
    WHERE elem ->> 'id' = child_field_id
    LIMIT 1;

    IF child_field IS NULL THEN
        RAISE EXCEPTION 'child field "%" not found in experiment %', child_field_id, exp_id;
    END IF;

    -- The Other trigger value comes from the child field's conditionalOn.value.
    other_option_value := child_field -> 'conditionalOn' ->> 'value';
    IF other_option_value IS NULL THEN
        RAISE EXCEPTION 'child field "%" has no conditionalOn.value', child_field_id;
    END IF;

    -- The label shown for the "Other" option: take it from whichever option in the
    -- parent's list has value = other_option_value.  If no such explicit option
    -- exists, fall back to the child field's label.
    SELECT opt -> 'label' INTO other_option_label
    FROM jsonb_array_elements(COALESCE(parent_field -> 'options', '[]'::jsonb)) opt
    WHERE opt ->> 'value' = other_option_value
    LIMIT 1;

    IF other_option_label IS NULL THEN
        other_option_label := child_field -> 'label';
    END IF;

    -- Build the replacement select-or-other field:
    --   • Keep parent's id, label, required, and conditionalOn.
    --   • options: parent's list minus the explicit "Other" entry (select-or-other
    --     renders it implicitly via otherLabel).
    --   • otherLabel: label of the removed "Other" option (or child's label).
    --   • otherPlaceholder: child's placeholder (omitted when null/absent).
    new_field := jsonb_strip_nulls(jsonb_build_object(
        'id',             parent_field ->> 'id',
        'type',           'select-or-other',
        'label',          parent_field -> 'label',
        'required',       parent_field -> 'required',
        'options',        COALESCE((
                              SELECT jsonb_agg(opt ORDER BY opt -> 'value')
                              FROM jsonb_array_elements(
                                   COALESCE(parent_field -> 'options', '[]'::jsonb)
                              ) opt
                              WHERE opt ->> 'value' != other_option_value
                          ), '[]'::jsonb),
        'otherLabel',     other_option_label,
        'otherPlaceholder', child_field -> 'placeholder',
        'conditionalOn',  parent_field -> 'conditionalOn'
    ));

    -- Rebuild the fields array: swap parent → new_field, drop child.
    SELECT jsonb_agg(
        CASE WHEN elem ->> 'id' = parent_field_id THEN new_field ELSE elem END
        ORDER BY ordinality
    )
    INTO new_fields
    FROM jsonb_array_elements(fields) WITH ORDINALITY elem(elem, ordinality)
    WHERE elem ->> 'id' != child_field_id;

    -- Patch the config.
    exp_config := jsonb_set(exp_config, '{registration,fields}', new_fields);

    -- Rewrite participant data.
    -- Pass 1: participants who chose Other → promote child's typed value to parent key.
    UPDATE participants
    SET registration_data = (
            (registration_data || jsonb_build_object(parent_field_id, registration_data ->> child_field_id))
            - child_field_id
        )
    WHERE experiment_id = exp_id
      AND registration_data ->> parent_field_id = other_option_value
      AND (registration_data ->> child_field_id) IS NOT NULL
      AND (registration_data ->> child_field_id) != '';
    GET DIAGNOSTICS participants_updated = ROW_COUNT;

    -- Pass 2: participants who didn't choose Other → just drop the now-obsolete child key.
    UPDATE participants
    SET registration_data = registration_data - child_field_id
    WHERE experiment_id = exp_id
      AND registration_data ? child_field_id
      AND NOT (
              registration_data ->> parent_field_id = other_option_value
          AND (registration_data ->> child_field_id) IS NOT NULL
          AND (registration_data ->> child_field_id) != ''
      );

    -- Save a new config version.
    SELECT COALESCE(MAX(v.version_number), 0) + 1 INTO next_ver
    FROM experiment_config_versions v
    WHERE v.experiment_id = exp_id;

    INSERT INTO experiment_config_versions (experiment_id, version_number, config)
    VALUES (exp_id, next_ver, exp_config);

    -- Update the live config.
    new_updated_at := now();
    UPDATE experiments
    SET config     = exp_config,
        updated_at = new_updated_at
    WHERE id = exp_id;

    -- Audit entry.
    INSERT INTO admin_audit_log
        (admin_email, experiment_id, action, resource_type, resource_id, metadata)
    VALUES (
        operator_email,
        exp_id,
        'config.migrate_select_or_other',
        'registration_field',
        parent_field_id,
        jsonb_build_object(
            'parent_field_id',   parent_field_id,
            'child_field_id',    child_field_id,
            'other_option_value', other_option_value,
            'participants_updated', participants_updated,
            'config_version',    next_ver
        )
    );

    RETURN jsonb_build_object(
        'participants_updated', participants_updated,
        'config_version',       next_ver,
        'other_option_value',   other_option_value
    );
END;
$$;
