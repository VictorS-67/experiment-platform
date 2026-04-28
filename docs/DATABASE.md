# Database Schema

## Tables

```sql
experiments                (id UUID PK, slug TEXT UNIQUE, status TEXT, config JSONB, created_by UUID, created_at, updated_at)
participants               (id UUID PK, experiment_id FK, email TEXT, registration_data JSONB, session_token UUID UNIQUE NOT NULL,
                            chunk_assignments JSONB DEFAULT '{}', last_active_at TIMESTAMPTZ, last_rotated_at TIMESTAMPTZ, registered_at)
                           UNIQUE(experiment_id, email)
responses                  (id UUID PK, experiment_id FK, participant_id FK, phase_id TEXT, stimulus_id TEXT,
                            response_data JSONB, response_index INT DEFAULT 0, created_at, updated_at)
                           UNIQUE(participant_id, phase_id, stimulus_id, response_index)
file_uploads               (id UUID PK, response_id FK, experiment_id FK, participant_id FK, widget_id TEXT,
                            storage_path TEXT, file_type TEXT, file_size INT, created_at)
admin_users                (user_id UUID PK FK auth.users, role TEXT, created_at)
experiment_config_versions (id UUID PK, experiment_id FK, version_number INT, config JSONB, created_at)
experiment_collaborators   (id UUID PK, experiment_id FK, user_id UUID FK auth.users, role TEXT CHECK(owner|editor|viewer), created_at)
                           UNIQUE(experiment_id, user_id)
pending_invites            (id UUID PK, experiment_id FK, email TEXT, role TEXT, invited_by UUID, claim_token UUID UNIQUE,
                            created_at, claimed_at TIMESTAMPTZ?, claimed_by UUID?)
rate_limits                (key TEXT, endpoint TEXT, window_start TIMESTAMPTZ, count INT)
                           PRIMARY KEY (key, endpoint, window_start)
admin_audit_log            (id UUID PK, admin_user_id UUID, admin_email TEXT, experiment_id UUID FK ON DELETE SET NULL,
                            action TEXT, resource_type TEXT?, resource_id TEXT?, ip TEXT?, metadata JSONB?, created_at)
error_log                  (id UUID PK, level TEXT, message TEXT, stack TEXT?, context JSONB?, created_at)
```

## Views (all `security_invoker = true`)

```sql
response_flat                    -- Joins responses + experiments + participants for CSV export
experiment_participant_counts    -- Aggregate participant count per experiment (migration 020)
participant_response_counts      -- Aggregate response count per participant (migration 020)
phase_participant_counts         -- Per-phase participant count per experiment (migration 020)
stimulus_response_counts         -- Per-stimulus response count per experiment (migration 020)
```

## RPC Functions

| RPC | Purpose |
|-----|---------|
| `set_chunk_assignment(p_id, chunk_key, assignment)` | Atomic `jsonb_set` on `participants.chunk_assignments`. Avoids read-modify-write races. |
| `insert_config_version(exp_id, cfg)` | Atomic `MAX(version_number)+1` insert into `experiment_config_versions`. |
| `upsert_config_with_version(exp_id, cfg, expected_updated_at)` | Atomic config update + version row insert with optimistic lock. Raises `P0004` when `expected_updated_at` doesn't match. |
| `rate_limit_check(p_key, p_endpoint, p_max, p_window_seconds)` | Sliding-window per-key counter. Returns `true` when allowed, `false` when over limit. |
| `cleanup_rate_limits()` | Deletes `rate_limits` rows older than the longest window. Run periodically. |

## Triggers

- `enforce_owner_invariant` (on `experiment_collaborators`): blocks DELETE/UPDATE that would leave an experiment with zero owners. Short-circuits when the parent experiment is itself being deleted (so cascade-delete works).
- `auto_add_creator_as_owner` (on `experiments`): inserts an `experiment_collaborators(role='owner')` row for `created_by` after insert.

## Migrations

| # | File | Purpose |
|---|------|---------|
| 001 | `001_initial_schema.sql` | Tables, indexes (GIN on JSONB), `response_flat` view |
| 002 | `002_rls_policies.sql` | Initial permissive RLS |
| 003 | `003_tighten_rls.sql` | Restrictive RLS: reference checks on INSERT, removed UPDATE on responses |
| 004 | `004_session_security.sql` | `session_token` column with UUID default |
| 005 | `005_remove_anon_select.sql` | Removed anon SELECT on participants/responses/file_uploads |
| 006 | `006_fix_view_security.sql` | `response_flat` recreated with `security_invoker = true` |
| 007 | `007_experiment_versions.sql` | `experiment_config_versions` table |
| 008 | `008_chunk_assignments.sql` | `chunk_assignments JSONB` column on participants |
| 009 | `009_chunk_assignment_rpc.sql` | Atomic `set_chunk_assignment` RPC |
| 010 | `010_config_version_rpc.sql` | Atomic `insert_config_version` RPC |
| 011 | `011_session_last_active.sql` | `last_active_at` column for session expiry |
| 012 | `012_response_unique.sql` | Unique constraint on responses |
| 013 | `013_invalidate_exposed_sessions.sql` | One-shot rotation of all session tokens to fresh UUIDs (post-incident) |
| 014 | `014_upsert_config_with_version.sql` | `upsert_config_with_version` RPC + optimistic lock surface |
| 015 | `015_experiment_collaborators.sql` | `experiment_collaborators` + `pending_invites` + owner-invariant trigger + auto-add-creator trigger |
| 016 | `016_rate_limits.sql` | `rate_limits` table + `rate_limit_check` RPC + `cleanup_rate_limits` |
| 017 | `017_admin_audit_log.sql` | Append-only `admin_audit_log` (FK to experiments is `ON DELETE SET NULL`) |
| 018 | `018_participant_session_rotation.sql` | `last_rotated_at` for time-based session rotation |
| 019 | `019_error_log.sql` | `error_log` for unhandled 500s |
| 020 | `020_count_views.sql` | Aggregate count views with `security_invoker = true` |
| 021 | `021_owner_invariant_cascade_fix.sql` | Trigger short-circuits when parent experiment is being deleted |

## RLS Security Model

- **Anon key can**: SELECT from `experiments` (active configs), INSERT into participants/responses/file_uploads (with reference checks)
- **Anon key cannot**: SELECT from participants/responses/file_uploads, UPDATE anything, DELETE anything
- **Service role key**: Full unrestricted access (server-side only). All admin code paths use this key.
- **Per-experiment authorization** is enforced at the application layer via `requireExperimentAccess()` from `$lib/server/collaborators` — RLS does NOT enforce collaborator roles because every admin route already runs as service role.

## FK Cascade Notes

- `experiments → participants → responses → file_uploads` chain is `ON DELETE CASCADE`. Deleting an experiment removes all dependent data.
- `experiments → experiment_collaborators` is `ON DELETE CASCADE`. The owner-invariant trigger short-circuits during cascade (see migration 021).
- `experiments → admin_audit_log` is `ON DELETE SET NULL`. Audit rows survive experiment deletion with `experiment_id = NULL`.
  - **Insertion ordering matters**: inserting a child audit row that points at an already-deleted parent violates the FK at INSERT time. In delete actions, call audit BEFORE the cascade delete.
