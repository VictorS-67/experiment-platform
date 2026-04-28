-- Admin action audit log.
--
-- Append-only record of every admin mutation (config save, participant
-- delete, collaborator change, etc.) for compliance and forensic use. Reads
-- are deliberately not logged (would dwarf the writes and provide little
-- forensic value).
--
-- Retention: indefinite. Operate manually if the table grows large; not
-- expected to be a problem at research-platform scale.

CREATE TABLE admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email TEXT,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_admin ON admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX idx_audit_experiment ON admin_audit_log(experiment_id, created_at DESC) WHERE experiment_id IS NOT NULL;
CREATE INDEX idx_audit_action ON admin_audit_log(action, created_at DESC);

-- RLS: anon/authenticated have zero access; only service role writes/reads.
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
