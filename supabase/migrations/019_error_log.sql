-- Error log for server-side exceptions.
--
-- Captures unhandled errors from request handlers so they're queryable post
-- hoc. The app calls reportError() (src/lib/server/errors.ts) which writes
-- here by default and can be swapped to Sentry later by setting an env var.
--
-- Retention: indefinite. Manual cleanup if growth becomes a problem.

CREATE TABLE error_log (
  id BIGSERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  method TEXT,
  status INTEGER,
  user_id UUID,
  participant_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_log_created ON error_log(created_at DESC);
CREATE INDEX idx_error_log_status ON error_log(status, created_at DESC) WHERE status IS NOT NULL;

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
