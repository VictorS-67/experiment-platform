# Database Schema

## Tables

```sql
experiments         (id UUID PK, slug TEXT UNIQUE, status TEXT, config JSONB, created_by UUID, created_at, updated_at)
participants        (id UUID PK, experiment_id FK, email TEXT, registration_data JSONB, session_token UUID UNIQUE NOT NULL,
                     chunk_assignments JSONB DEFAULT '{}', last_active_at TIMESTAMPTZ, registered_at)
                    UNIQUE(experiment_id, email)
responses           (id UUID PK, experiment_id FK, participant_id FK, phase_id TEXT, stimulus_id TEXT,
                     response_data JSONB, response_index INT DEFAULT 0, created_at, updated_at)
                    UNIQUE(participant_id, phase_id, stimulus_id, response_index)
file_uploads        (id UUID PK, response_id FK, experiment_id FK, participant_id FK, widget_id TEXT,
                     storage_path TEXT, file_type TEXT, file_size INT, created_at)
admin_users         (user_id UUID PK FK auth.users, role TEXT, created_at)
experiment_config_versions (id UUID PK, experiment_id FK, version_number INT, config JSONB, created_at)
```

## Views

```sql
response_flat       -- security_invoker = true
                    -- Joins responses + experiments + participants for CSV export
```

## RPC Functions

- `set_chunk_assignment(p_id, chunk_key, assignment)` — Atomic jsonb_set on participants.chunk_assignments
- `insert_config_version(exp_id, cfg)` — Atomic MAX(version)+1 insert into config versions

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

## RLS Security Model

- **Anon key can**: SELECT from `experiments` (active configs), INSERT into participants/responses/file_uploads (with reference checks)
- **Anon key cannot**: SELECT from participants/responses/file_uploads, UPDATE anything, DELETE anything
- **Service role key**: Full unrestricted access (server-side only)
