-- Multi-admin collaborators model.
--
-- Replaces the de-facto "every admin sees every experiment" model with a
-- per-experiment role table:
--   owner  → full control (incl. delete + collaborator management)
--   editor → edit config, manage participants, export data
--   viewer → read-only
--
-- Backfill rules:
--   1. experiments.created_by IS NOT NULL → that admin becomes the sole owner.
--   2. experiments.created_by IS NULL (legacy rows from before created_by was
--      populated by the admin UI) → every existing admin becomes an owner so
--      no one loses access. Owners can clean this up later via the UI.

CREATE TABLE experiment_collaborators (
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, user_id)
);

CREATE INDEX idx_collaborators_user ON experiment_collaborators(user_id);

-- Pending invites for emails not yet in admin_users.
-- claim_token is the secret used in the fallback "copy link" flow when
-- Supabase Auth's email send fails or is unconfigured.
CREATE TABLE pending_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  claim_token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  UNIQUE (experiment_id, email)
);

CREATE INDEX idx_pending_invites_email ON pending_invites(LOWER(email)) WHERE claimed_at IS NULL;
CREATE INDEX idx_pending_invites_token ON pending_invites(claim_token) WHERE claimed_at IS NULL;

-- Backfill rule 1: creators become owners.
INSERT INTO experiment_collaborators (experiment_id, user_id, role, added_at)
SELECT e.id, e.created_by, 'owner', e.created_at
FROM experiments e
WHERE e.created_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = e.created_by)
ON CONFLICT DO NOTHING;

-- Backfill rule 2: NULL-creator legacy rows → every admin becomes an owner.
INSERT INTO experiment_collaborators (experiment_id, user_id, role, added_at)
SELECT e.id, a.user_id, 'owner', e.created_at
FROM experiments e
CROSS JOIN admin_users a
WHERE e.created_by IS NULL
ON CONFLICT DO NOTHING;

-- Invariant: every experiment must always have ≥1 owner.
-- Without this, a careless demote/remove leaves an experiment with no one
-- able to manage it.
CREATE OR REPLACE FUNCTION enforce_owner_invariant()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
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

CREATE TRIGGER enforce_owner_invariant_trigger
BEFORE UPDATE OR DELETE ON experiment_collaborators
FOR EACH ROW EXECUTE FUNCTION enforce_owner_invariant();

-- Auto-add the creator as owner on new experiment.
-- Fires only when created_by is set (i.e., by the admin UI; not by the
-- backfill INSERT above, which already inserted owner rows manually).
CREATE OR REPLACE FUNCTION add_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO experiment_collaborators (experiment_id, user_id, role, added_by)
    VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER add_creator_as_owner_trigger
AFTER INSERT ON experiments
FOR EACH ROW EXECUTE FUNCTION add_creator_as_owner();

-- RLS: enable so anon/authenticated have zero access by default.
-- The server uses the service role and bypasses RLS, so no policies needed
-- for the current architecture; this is defense-in-depth for any future
-- route that accidentally uses the anon key.
ALTER TABLE experiment_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;
