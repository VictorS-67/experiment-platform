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
