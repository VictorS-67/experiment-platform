-- Fix: enforce_owner_invariant blocks ON DELETE CASCADE from experiments.
--
-- When an owner deletes their own experiment, Postgres cascades to
-- experiment_collaborators. The BEFORE DELETE trigger fires per-row and
-- raises P0005 because no "other owner" remains — so the cascade aborts
-- and the owner can never delete their own experiment (admin UI and
-- service-role DELETE both fail the same way).
--
-- Fix: short-circuit the invariant when the parent experiment is itself
-- being deleted. The invariant still protects the UX case it was written
-- for — an admin removing a collaborator or demoting an owner via the
-- panel still trips the guard, because the experiment row is still there.

CREATE OR REPLACE FUNCTION enforce_owner_invariant()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
    -- If the parent experiment is gone (or going in this same statement),
    -- the collaborator row is being cascaded — nothing left to protect.
    IF NOT EXISTS (SELECT 1 FROM experiments WHERE id = OLD.experiment_id) THEN
      RETURN OLD;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM experiment_collaborators
      WHERE experiment_id = OLD.experiment_id
        AND role = 'owner'
        AND user_id <> OLD.user_id
    ) THEN
      RAISE EXCEPTION 'Cannot remove the last owner of experiment %', OLD.experiment_id
        USING ERRCODE = 'P0005';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM experiment_collaborators
      WHERE experiment_id = OLD.experiment_id
        AND role = 'owner'
        AND user_id <> OLD.user_id
    ) THEN
      RAISE EXCEPTION 'Cannot demote the last owner of experiment %', OLD.experiment_id
        USING ERRCODE = 'P0005';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
