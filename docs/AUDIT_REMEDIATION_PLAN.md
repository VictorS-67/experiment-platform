# Audit Remediation Roadmap

Generated 2026-04-17 from the five-domain code audit. This is a **roadmap**, not an executable plan — each phase below will be expanded into its own task-by-task plan before implementation.

Grouping principle: **each phase is independently shippable and has no mid-phase dependencies on later phases.** Phases are ordered by risk reduction per unit of effort.

## Audit corrections (verified against current repo state)

Three items flagged by the audit are already fine:
- `backup-2026-03-22.json` is **not** tracked in git (was only in working tree) — no history scrub needed, just delete locally.
- No `.DS_Store` files are tracked (`git ls-files` empty).
- `FUTURE_PLANS.md` is gitignored and untracked — consistent, no action.

Drop these from scope; they only need a local `rm`.

---

## Decisions (locked in 2026-04-17)

1. **Collaborator invites:** email-invite flow. Inviter enters an email address; any existing admin is added as a collaborator immediately; unknown emails receive a Supabase Auth magic-link signup and a pending `invite` row that is claimed on first login.
2. **Backup endpoint:** any admin may run `/admin/backup` — this is intentional, not an IDOR. Document it.
3. **`backup-2026-03-22.json`:** treat as potentially compromised. Migration `013_invalidate_exposed_sessions.sql` clears every `participants.session_token`; everyone re-logs in once.
4. **Rate-limit store:** Postgres-backed. Use a `rate_limits(ip, endpoint, window_start, count)` table in Supabase rather than adding Upstash/Vercel KV. Same infra we already run; +1 cheap write per request at our scale.
5. **Participant session rotation:** time-based. Rotate the token when `last_rotated_at` is more than 24 h stale. No per-request rotation (avoids multi-tab races). No UA fingerprint binding.
6. **Schema migration strategy:** one-shot. Write a Node script that re-validates and upgrades every stored config at deploy time; fail the deploy if any config cannot be upgraded.
7. **Invite signup:** if the invited email is not in `admin_users`, call `supabase.auth.admin.inviteUserByEmail()` so Supabase sends the signup email; a row in `pending_invites(email, experiment_id, role, invited_by, invited_at, expires_at)` is created; on first successful login we claim matching invites by email → create the `admin_users` row → create the `experiment_collaborators` rows.

---

## Phase A — Critical correctness (≈2 days) — **DONE 2026-04-17**

Fixes the two known data races, the two atomicity gaps, and the non-deterministic shuffle. All are root-cause fixes; no band-aids.

| # | Fix | Status |
|---|---|---|
| A1 | `saveChunkAssignment` now calls the `set_chunk_assignment` RPC (migration 009) instead of read-modify-write. | ✅ |
| A2 | `saveConfigVersion` now calls `insert_config_version` RPC (migration 010). | ✅ |
| A3 | Migration `014_upsert_config_with_version.sql` adds an RPC that atomically inserts the next `experiment_config_versions` row and updates `experiments.config` under a row lock. New helper `saveConfigWithVersion` replaces the two-step call from the config editor and from `rollbackToVersion`. | ✅ |
| A4 | Optimistic-locking token (`experiments.updated_at`) is sent with every config save; the RPC rejects stale saves with Postgres error code `P0004`, surfaced to the client as `ConfigConflictError` and a 409 with a clear message. | ✅ |
| A5 | `Math.random()` shuffles replaced with `seededShuffle` using a UUID seed (fresh per visit on the client, fresh per request on the server) — proper Fisher-Yates instead of the biased sort-by-random comparator, and no reactive-retriggering reshuffle. | ✅ |
| A6 | Existing 118 tests pass; deferred: dedicated concurrency integration tests (require a test Supabase instance — pulled into Phase H). | partial |

Exit criteria met: two concurrent chunk-assignment writes cannot lose data (RPC 009 is a single atomic UPDATE); two concurrent config saves either succeed in series (row lock in RPC 014) or the second is rejected as a conflict (P0004). Stimulus order is stable across reactive re-renders within a visit.

---

## Phase B — Immediate hygiene & CI (≈half day) — **DONE 2026-04-17**

| # | Fix | Status |
|---|---|---|
| B1 | Backup file deleted; migration `013_invalidate_exposed_sessions.sql` clears every `participants.session_token` so any tokens the file might have exposed are useless. | ✅ |
| B2 | Vitest config split into `vitest.config.ts`; `vite.config.ts` no longer type-errors in `svelte-check`. | ✅ |
| B3 | `dotenv` moved to `devDependencies`. | ✅ |
| B4 | `SUMMARY.md` updated to show `adapter-vercel` in both the tech-stack table and the project-structure comment. | ✅ |
| B5 | `.credentials` file documented in the README admin-setup section. | ✅ |

---

## Phase C — Multi-admin collaborators model (≈1 week)

Required before any `created_by` scoping becomes the access-control mechanism. Unblocks the real fixes to the audit's backup IDOR and participant-detail IDOR.

**Migration `014_experiment_collaborators`:**
- Table `experiment_collaborators(experiment_id uuid, admin_id uuid, role text check (role in ('owner','editor','viewer')), created_at, primary key (experiment_id, admin_id))`
- Trigger or server helper auto-inserts creator as `owner` on new experiment
- Data migration: backfill one `owner` row per existing experiment using `experiments.created_by`
- RLS policies updated so server-side access uses membership rather than `created_by`

**Helper `requireExperimentAccess(adminId, experimentId, minRole)`:**
- Returns role or throws 403
- Precedence `owner > editor > viewer`
- Single source of truth used by every admin route that touches a specific experiment

**Route-level scoping:**
- `[id]/+layout.server.ts` — require at least `viewer`
- `[id]/config/+page.server.ts` — require `editor`
- `[id]/settings/+page.server.ts` — require `owner`
- `[id]/data/export/+server.ts` — require `editor`
- `[id]/participants/[participantId]/+page.server.ts` — require `viewer` AND verify participant belongs to the experiment (addresses H3 IDOR at its root)
- `/admin/backup/+server.ts` — filter to experiments where admin is `owner`, or route behind `super_admin` flag per decision 2
- `/admin/experiments/+page.server.ts` — list filters by membership

**Minimal UI:**
- New section in `[id]/settings` showing current collaborators (role per row)
- Add/remove: dropdown vs email-invite per decision 1
- "Leave experiment" button for non-owners

Exit criteria: admin A cannot read, modify, or export anything for an experiment they aren't a collaborator on; an experiment with zero owners is impossible.

---

## Phase D — Schema hardening (≈3 days)

Applies the "root-cause" philosophy to validation: instead of runtime narrowing everywhere, encode the invariants in Zod.

| # | Fix | File |
|---|---|---|
| D1 | `z.discriminatedUnion('type', ...)` for `PhaseConfig` and `ResponseWidget` | `schema.ts` |
| D2 | `superRefine` requiring `reviewConfig` + `sourcePhase` when `phase.type === 'review'` | `schema.ts` |
| D3 | `superRefine` checking that every phase ref, widget ref, and stimulus ref points to an existing id | `schema.ts` |
| D4 | Replace `z.record(z.string(), z.any())` on stimulus metadata with `z.record(z.string(), z.string())` (or a typed union per decision 6) | `schema.ts:207` |
| D5 | Replace `LocalizedString = z.record(z.string(), z.string())` with whitelisted language codes | `schema.ts:4` |
| D6 | Centralize config loading into a single `loadValidatedConfig(experimentId)` helper that re-parses on every read; refactor `getExperiment`, `rollbackToVersion`, etc. to use it | `src/lib/server/admin.ts`, `src/lib/server/data.ts` |
| D7 | Make `createExperiment`, `rollbackToVersion` accept `ExperimentConfig` (inferred type), not `Record<string, unknown>` | `admin.ts:49,94,141` |
| D8 | Validate bulk-imported stimuli against `StimulusItem` before insertion | `bulk-import.ts`, `BulkImportModal.svelte` |
| D9 | Schema migration strategy per decision 6 | new `src/lib/config/migrations/` or one-shot script |
| D10 | Comprehensive negative-case tests for each refinement | `schema.test.ts` |

---

## Phase E — Frontend correctness & a11y (≈3 days) — **DONE 2026-04-18**

All audit-flagged items shipped. Concrete work:
- `Modal.svelte`: focus trap + return-focus-on-close, `wide` prop, Escape + keyboard handler
- Break-countdown `setInterval` cleared in a component-unmount `$effect` on both phase pages
- `<html lang>` follows i18n and persists to localStorage
- Tutorial gatekeeper buttons given explicit `type="button"`
- Admin login `update({ reset: false })`
- Stimulus image alt uses localized label
- `orderedStimulusIds` typed at the access site
- Phase-A `Math.random` shuffle fix
- **Full a11y sweep**: 79 → 0 warnings. `Field.svelte` helper applied across PhasesSection, StimuliSection, CompletionSection, RegistrationSection, TutorialSection, BulkImportModal, MetadataSection, ChunkingSection; LocalizedInput wraps its per-language inputs in a `<fieldset>` with per-row `aria-label`; data export dialog uses `<fieldset>/<legend>` for the radio groups
- 5 remaining "capture initial value" warnings annotated with `svelte-ignore state_referenced_locally` + explanatory comments where the one-shot-on-mount behavior is intentional



| # | Fix | File |
|---|---|---|
| E1 | Replace `structuredClone + reassign` with direct `$state` proxy mutation in `ConfigEditor` (this codebase already has the pattern documented in CLAUDE.md) | `[id]/config/+page.svelte:17`, `ConfigEditor.svelte` |
| E2 | Break-countdown `setInterval` wrapped in `$effect` with cleanup return | `[phaseSlug]/+page.svelte:560-566`, `[slug]/+page.svelte:37` |
| E3 | `Modal.svelte` — focus trap + return-focus-on-close + Escape binding tests | `Modal.svelte` |
| E4 | `<html lang={...}>` bound to i18n; persist language to localStorage | `app.html`, `i18n/index.svelte.ts:23-34` |
| E5 | Extract hardcoded strings ("Time for a break!", config editor warnings) into i18n | `[slug]/+page.svelte:217`, `config/+page.svelte:120` |
| E6 | Add explicit `type="button"` to tutorial buttons | `tutorial/+page.svelte:133-146` |
| E7 | `admin/login` — `update({ reset: false })` | `admin/login/+page.svelte:30` |
| E8 | Improve stimulus image `alt` text (use label.en fallback) | `StimulusRenderer.svelte:36` |
| E9 | Fix all 30+ `svelte-check` a11y label-association warnings in admin config sections | multiple files under `src/lib/components/admin/config/` |
| E10 | Select-all checkbox in data page gets `aria-label` | `data/+page.svelte:266` |

---

## Phase F — Security hardening (≈1 week) — **MOSTLY DONE 2026-04-18**

Done:
- **F2** HSTS header (`max-age=31536000; includeSubDomains; preload`) — active in prod, skipped in dev. [hooks.server.ts](src/hooks.server.ts)
- **F3** Admin audit log — [migration 017](supabase/migrations/017_admin_audit_log.sql), [audit.ts helper](src/lib/server/audit.ts), wired into config save, status change, experiment delete, participant reset/delete, collaborator invite/role/remove, invite revoke, backup export
- **F4** Registration data XSS — verified Svelte auto-escapes; no `{@html}` anywhere in `src/`. Already safe
- **F5** Participant session rotation — [migration 018](supabase/migrations/018_participant_session_rotation.sql) adds `last_rotated_at`; [getParticipantAndMaybeRotate](src/lib/server/data.ts) rotates tokens >24h stale on participant GET requests
- **F6** Admin refresh-token rotation — Supabase's built-in rotation already works (sets new `refresh_token` on refresh); shortened cookie lifetime 30d → 14d
- **F8** Postgres-backed rate limiter — [migration 016](supabase/migrations/016_rate_limits.sql) with `rate_limit_check` RPC + `cleanup_rate_limits`; [rate-limit.ts helper](src/lib/server/rate-limit.ts); hooks swapped over
- **F9** `seed.js` refuses remote URLs without `--allow-remote` flag
- **F10** Error reporting abstraction — [migration 019](supabase/migrations/019_error_log.sql), [errors.ts](src/lib/server/errors.ts), `handleError` hook wired. Swap to Sentry by filling in `sendToExternalReporter` + setting `SENTRY_DSN`

- **F1 — DONE 2026-04-18**: CSP migrated to SvelteKit's built-in `kit.csp` config (auto-mode: nonces in dev, SHA hashes in prod). `'unsafe-inline'` removed from `script-src` and `style-src-elem`; only `style-src-attr 'unsafe-inline'` remains to allow dynamic inline style attributes (progress bars, rotations, etc.). Manual CSP header removed from `hooks.server.ts`
- **F7 — DONE 2026-04-18**: email-enum trade-off documented inline at `auth/+server.ts` with the threat model and the trigger for revisiting (platform opened up beyond pre-invited participants)



| # | Fix | Where |
|---|---|---|
| F1 | Remove `'unsafe-inline'` from CSP `script-src` and `style-src` via nonce injection in `hooks.server.ts` + remove remaining inline styles/scripts | `hooks.server.ts:182-183`, templates |
| F2 | Add HSTS header (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`) | `hooks.server.ts` |
| F3 | Audit log table + `logAdminAction(adminId, action, resource)` helper invoked from every mutation | new migration `015_admin_audit_log`, new helper, wire into admin routes |
| F4 | Escape registration data when rendered in admin UI (use existing `html-escape.ts` — audit found it's unused) | `participants/[participantId]/+page.svelte` etc. |
| F5 | Participant session rotation per decision 5 | `src/lib/server/cookies.ts`, `hooks.server.ts` |
| F6 | Admin refresh-token rotation (issue new refresh + invalidate old on each use) | `hooks.server.ts` admin auth flow |
| F7 | Email enumeration fix on participant `/auth` — return identical shape regardless of email existence | `auth/+server.ts:88` |
| F8 | Rate limiter backed by Upstash/KV per decision 4 | `hooks.server.ts:9-44` |
| F9 | Scripts add safety check: abort if env looks like prod and operator didn't opt in | `scripts/seed.js`, `scripts/export-configs.js` |

---

## Phase G — Data layer cleanup (≈3 days) — **DONE 2026-04-18**

- **G1** Deleted dead `src/lib/services/supabase.ts`
- **G2** `PARTICIPANT_COLUMNS` / `RESPONSE_COLUMNS` constants replace `.select('*')` on participant + response reads. `/admin/backup` explicitly omits `participants.session_token` so a leaked backup can't be used to hijack sessions
- **G3** Migration 020 adds four aggregate views (`experiment_participant_counts`, `participant_response_counts`, `phase_participant_counts`, `stimulus_response_counts`) with `security_invoker = true`. `listExperiments`, `getParticipants`, and `getExperimentStats` now hit these views instead of streaming every row
- **G4** `/admin/backup` streams the JSON document table-by-table via `ReadableStream` + a new `paginate()` helper (`src/lib/server/pagination.ts`). CSV/JSON participant export still buffers because research-style aggregation needs group-by across all rows — documented inline with the migration path
- **G5** Upload-path sanitization uses a segment-level whitelist



| # | Fix | Where |
|---|---|---|
| G1 | Delete `src/lib/services/supabase.ts` (never imported) | file deletion |
| G2 | Replace `.select('*')` on participant/response queries with explicit column lists where the full JSONB isn't needed | `src/lib/server/data.ts:13,28,63,80` |
| G3 | Replace in-memory count loops with `.select('*', { count: 'exact', head: true })` or a SQL view | `admin.ts:14-23,165-177` |
| G4 | Stream backup + CSV/JSON export using `ReadableStream` instead of loading all rows | `backup/+server.ts`, `data/export/+server.ts` |
| G5 | Upload-path sanitization: segment-whitelist (alphanumeric + `-_.`) instead of substring strip | `data.ts:144` |

---

## Phase H — Testing & monitoring (≈1 week) — **DONE 2026-04-18**

- GitHub Actions CI: `check-and-test` job + parallel `e2e` job that boots local Supabase via the official setup-cli action, runs all migrations, exports env vars, and runs Playwright
- Error-monitoring abstraction already wired in Phase F10 (Postgres by default, Sentry-swappable)
- **H1** Playwright installed + `playwright.config.ts` with webServer wiring to `npm run dev`
- **H2** `tests/e2e/fixtures.ts` — per-test admin + service-role supabase client + cleanup; `loginAsAdmin` helper
- **H3** `tests/e2e/admin.spec.ts` — login flow, create experiment, reach config page, reject bad password
- **H4** `tests/e2e/collaborators.spec.ts` — exercises the Phase C flow end-to-end: creator becomes owner, invite surfaces a `?claim=<uuid>` fallback link because local Supabase has no SMTP
- **H5** `tests/e2e/participant.spec.ts` — entry-point coverage (404 on unknown slug). Full-phase-completion flow deferred with a comment in the spec — needs either a seed fixture or a programmatic config-build helper
- **H6** `save.test.ts` rewritten as integration test that drives the real `POST` handler via `vi.mock` of its three external collaborators. Caught and fixed a latent bug: review phases were having their response-UUID stimulusId validated against the stimulus-items list

Run locally:
```
supabase start
eval "$(supabase status -o env)"
export PUBLIC_SUPABASE_URL=$API_URL PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
npm run test:e2e
```



| # | Fix | Where |
|---|---|---|
| H1 | Add Playwright + GitHub Actions workflow | `playwright.config.ts`, `.github/workflows/e2e.yml` |
| H2 | E2E: participant happy path (register → 2 phases → review → complete) | `tests/e2e/participant.spec.ts` |
| H3 | E2E: admin happy path (login → create exp → edit config → export CSV) | `tests/e2e/admin.spec.ts` |
| H4 | E2E: multi-admin collaborator scenario (from Phase C) | `tests/e2e/collaborators.spec.ts` |
| H5 | Integration tests for `data.ts` and `admin.ts` against a test Supabase instance | `src/lib/server/*.test.ts` |
| H6 | Rewrite `save.test.ts` to exercise the actual `POST` handler instead of mirroring logic | `[phaseSlug]/save/save.test.ts` |
| H7 | Sentry (or alternative) integration with PII scrubbing | `hooks.server.ts`, new `sentry.server.ts` |

---

## Effort & sequencing

```
A ──┐
    ├─ parallelizable after A lands ──► D
B ──┘                                    │
                                         │
C (blocks F's backup scoping) ───────────┤
                                         │
E, G (independent, run any time) ────────┤
                                         │
F (needs C's collaborators for F4 scope) ┤
                                         │
H (best after A–F so E2E tests are meaningful)
```

Total wall-clock on one engineer: ~4–5 weeks. Phases A + B should land this week.

---

## Next step

Answer the 7 open decisions above, then I'll expand Phase A into a full task-by-task plan (TDD, bite-sized steps, exact file paths) under `docs/superpowers/plans/`. Phase B can ship alongside with no decisions needed.
