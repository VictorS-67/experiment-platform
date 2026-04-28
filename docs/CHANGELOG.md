# Development History

## Phase 1: Foundation
- Zod config schema with full type exports
- Database tables, indexes, initial RLS
- Registration flow (email -> conditional form -> Supabase)
- i18n system (EN/JA) with language switcher

## Phase 2: Stimulus + Response
- VideoPlayer, StimulusRenderer, StimulusNav
- All widget types: text, textarea, select, number, likert, timestamp-range, audio-recording
- Save/load responses, completion modal, ProgressBar
- AudioRecorder with MediaRecorder API

## Phase 2.5: Store Migration
- Migrated from Svelte 4 writables to Svelte 5 rune-based class stores (`.svelte.ts`)

## Phase 2.75: Security Hardening
- All Supabase mutations moved server-side (service role key only)
- Session token httpOnly cookies for participants
- Tightened RLS (append-only responses, removed anon SELECT on sensitive tables)
- CSP headers, Permissions-Policy, Referrer-Policy, X-Frame-Options

## Phase 3: Multi-Phase + Tutorial
- Multi-phase system with per-phase URLs, widgets, completion
- Review phases: load source responses, display with stimulus, collect review widgets
- Tutorial: Driver.js overlay with step validation (click, input, play)
- Gatekeeper questions with yes/no skip logic

## Phase 4: Admin Dashboard
- Supabase Auth admin login (verified against `admin_users` table)
- Experiment CRUD with status badges and participant counts
- ConfigEditor: form-based editor with type-aware widget routing
- Participants data table + CSV export with injection protection

## Post-Phase-4 Bug Fixes (2026-03-19)
1. Form mode edits not saving (structuredClone broke proxy reactivity)
2. JSON textarea blank after save (`update()` resetting form)
3. Missing "Next Phase" button (gated on optional config field)
4. Review widgets not appearing (wrong widget path for review phases)
5. Timestamp replay in review (added ReviewItemDisplay with replay)

## Technical Debt Cleanup (2026-03-19)
- `response_flat` SECURITY DEFINER fix (migration 006)
- Legacy endpoints removed
- Environment variable validation (fail-fast)
- Rate limiting + CSRF origin checking

## Phase 5: Production Readiness (2026-03-19)
- Deployed to Vercel with `@sveltejs/adapter-vercel`
- `slider` and `multiselect` widgets
- `random-per-participant` ordering (seeded shuffle: djb2 + mulberry32 + Fisher-Yates)
- Data migration from legacy Google Sheets experiments

## Phase 6: Enhanced Admin Features (2026-03-22)
- Config editor completeness (tutorial, per-phase intro/completion, widget configs, stimuli management)
- Experiment duplication, participant management (detail pages, reset, delete, bulk delete)
- Stats panel, enhanced CSV export (research style, JSON, registration columns, phase filter)
- Config versioning with rollback (migration 007)

## Code + Security Audit (2026-03-22)
- DB errors sanitized, `.single()` -> `.maybeSingle()`, cookie options deduplicated
- Dead code removed, `_timestamp` removed, audio listener leak fixed

## Phase 6.7: Bug Fixes & Minor Features (2026-03-24)
- `allowRevisit` fix, admin form field additions
- Timestamp review button with shared replay controller
- Tutorial introduction page

## Security Hardening (2026-03-24)
- CSRF tightened (blocks empty Origin in production)
- Session token rotation on every login
- Registration + response validation against config schema

## Phase 8.3: Conditional Logic (2026-03-24)
- Conditional widget visibility (`conditionalOn`)
- Skip stimuli rules (`SkipRule`)
- Phase branching (`BranchRule`)

## Phase 8.4: Break Screens + Block Completion (2026-03-24)
- Break screen modals between blocks with countdown timer
- Block boundaries and progress display
- Admin UI for break screen config

## Admin Pagination (2026-03-24)
- StimuliSection pagination (20/page with search/filter)

## Comprehensive Code Audit (2026-04-12)
- 31 bug fixes across critical, high, medium, and low priority
- New migrations: atomic chunk assignment RPC (009), config version RPC (010), session expiry (011), response unique constraint (012)
- Security: path traversal iterative sanitization, magic byte audio detection, HTML escaping, request size limits
- Stability: seeded shuffle for random ordering, i18n race protection, interval cleanup, phase-filtered response tracking
- Schema: superRefine validators for review phases, widget type requirements, unique IDs
- Tests: sanitization, audio detection, HTML escaping + existing schema/utils/replay tests

## Phase 7: Multi-Admin Collaboration + Hardening (2026-04-18 → 2026-04-19)

### Multi-admin collaborators (migration 015)
- `experiment_collaborators(experiment_id, user_id, role)` with role ∈ {owner, editor, viewer}
- `pending_invites` for email invites; claimed at next login via `claimInvitesForUser`
- `requireExperimentAccess(adminUser, expId, minRole)` gate on every admin route
- Owner-invariant trigger prevents removing/demoting the last owner; cascade-safe via 021
- Last-owner self-row UI rendered as a read-only badge (no dropdown / Remove button)

### Audit + error logging (migrations 017, 019)
- `admin_audit_log` (append-only) — `logAdminAction()` from `$lib/server/audit` writes per mutation
- `error_log` — `reportError()` abstraction (Postgres default, Sentry-swappable) writes 500s
- FK rule: `admin_audit_log.experiment_id` is `ON DELETE SET NULL`; audit must run BEFORE the cascade delete (inserting after the parent is gone violates the FK at INSERT time)

### Postgres-backed rate limiter (migration 016)
- `rate_limit_check` RPC + `cleanup_rate_limits` function
- Replaces in-memory module-scope counter; survives Vercel cold starts

### Optimistic locking surface (migration 014)
- `upsert_config_with_version` RPC accepts `expected_updated_at`; mismatch raises `P0004`
- Plumbed through `saveConfigWithVersion` AND `rollbackToVersion` (s3 fix — restore was bypassing the lock)
- 409 with "modified by another admin" toast; covered by A3.4 and A4.4 E2E

### Round-robin distribution fix
- `getParticipantIndex` ranks by `registered_at` ASC with id tie-break (s3-followup)
- Previous impl used `lt('id', ...)` — lexicographic UUID rank, broke latin-square round-robin
- P6.1 now strictly equals `latinSquareOrder(base, rank)` per registration order

### Misc fixes
- Owner-invariant trigger short-circuits when the parent experiment is being deleted (021) — prior to this the sole owner could never delete their own experiment
- Duplicate-slug create surfaces `Slug "X" is already taken` instead of opaque "Failed to create"
- Viewer Save Config button hidden via `data.myRole` gate (was rendering but always 403'd)
- Config editor `●` dirty indicator: canonical key-sorted JSON comparison + post-save re-sync (was permanently dirty due to JSONB key reordering + Zod default fill-in)
- Participant IDOR returns 404 not 500 (`getParticipantDetail` returns null on miss)
- `BulkImportModal.svelte` wired into `StimuliSection.svelte` — was complete-but-orphaned
- Stale `session_token` cookie cleared when participant row is gone — was producing redirect loops + theoretical token-reattachment hazard on backup restore (`hooks.server.ts` cookie delete on `getParticipantAndMaybeRotate === null`)
- Participant language preference no longer reset to `defaultLanguage` on every layout mount — `/e/[slug]/+layout.svelte` now resolves `stored ∩ supported || defaultLanguage` before calling `setLanguage`

### Schema hardening (migration 018)
- `participants.last_rotated_at` for time-based session rotation (24h)

### Read-side optimisations (migration 020)
- Aggregate count views with `security_invoker = true` for admin list/detail panels

### Background tables for security & data
- `rate_limits` (per-IP per-endpoint sliding window) — migration 016
- `admin_audit_log` — migration 017
- `error_log` — migration 019

### CSP via SvelteKit nonces
- `kit.csp` mode `'auto'` in `svelte.config.js`
- `script-src` nonce-bound; no `unsafe-inline` in `script-src`
- `style-src-attr 'unsafe-inline'` retained narrowly because Tailwind v4 uses inline styles

### E2E test infrastructure
- Playwright + per-test-isolated `ctx` fixture (creates a unique admin + tracks teardown)
- Local-Supabase safety guard in `tests/e2e/fixtures.ts` (refuses non-local URL without `E2E_ALLOW_REMOTE` env opt-in)
- 83 specs covering admin CRUD, collaborators, config editor + optimistic lock, version restore, access matrix, IDOR, audit + error logs, CSRF, headers, CSP/HSTS preview, rate limit, login edges incl. refresh-token rotation, participant registration, phase traversal, allowMultipleResponses + allowRevisit + conditional widgets, review-phase UUID gotcha, tutorial + Driver.js click-gate, chunking + strict round-robin (N=9), completion + feedback, bulk import (storage + CSV), claim-invite via Inbucket, session rotation (24h GET-only + cookie-clear on missing row), i18n persistence
- Standalone race scripts under `scripts/race/` (R1 chunk assignment, R2 config save, R3 burst)
- CI workflow at `.github/workflows/ci.yml` boots local Supabase and runs the suite
- One known deferred test: **S2.3 per-IP rate-limit counting** — only expressible against the deployed Vercel adapter, since the dev/preview server doesn't trust `X-Forwarded-For`. Per-IP correctness is provable by inspection of the limiter call site (`checkRateLimit(event.getClientAddress(), ...)`).

### A11y
- `Field.svelte` wrapper provides implicit label-input association for the entire admin config editor (cleared the 78 a11y warnings, including 33 from `PhasesSection.svelte`)

### Coding philosophy
- Added "Root-cause fixes, not band-aids" to `CLAUDE.md` as the project's stated coding principle
