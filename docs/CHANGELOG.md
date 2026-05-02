# Development History

## Pre-launch DB alignment + migration 026 application (2026-05-02)

Pre-launch audit revealed prod's `supabase_migrations.schema_migrations` table tracked only up through migration 007, but the actual schema state was much further along — most migrations had been applied via the SQL editor without invoking the CLI's ledger insert.

Six read-only probe queries (table/column/function/index existence) inventoried prod against the local migration tree. Result: schema was current for **008/014/015/016/017/018/019/020/022/023/024**, but **009/011/012/026 were genuinely missing** (and 010/013 were deliberately skipped — see "Retired" notes above).

**Applied to prod via a single transactional SQL block:**
- 009 — `set_chunk_assignment` RPC (chunked-experiment block-order persistence; without this, `data.ts:245` would 500 on every chunked-participant login).
- 011 — `participants.last_active_at` column (admin backup endpoint references it; without this, backups would 500).
- 012 — `responses_unique_idx` UNIQUE INDEX on `(participant_id, phase_id, stimulus_id, response_index)`. Pre-flight confirmed zero existing duplicates, so creation succeeded without conflict.
- 021 — re-applied `enforce_owner_invariant` body (CREATE OR REPLACE; idempotent re-application as belt-and-suspenders for the cascade-fix).
- 026 — dropped `idx_responses_data` (120 kB) and `idx_participants_registration` (32 kB). Both confirmed unused via grep (no JSONB-operator callers in app code).
- Ledger backfill — INSERT 19 rows (008–024 + 026) into `schema_migrations` so future `supabase db push` doesn't try to re-apply.

Pre-flight checks (all read-only) confirmed no duplicates that 012's unique index would reject, no triggers on `participants` that adding a column would interact with, 555 responses (small enough that 012's index build completed in milliseconds), and 18 participants (all with non-null `registered_at` so 011's backfill UPDATE was clean).

The whole apply was wrapped in `BEGIN ... COMMIT` for all-or-nothing semantics. Sanity SELECT after commit returned `count = 0` for the dropped indexes, confirming success.

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

## Bug Fixes & UX Improvements (2026-04-30)

### Participant-facing fixes
1. **Timestamp order validation** — Save blocked when `start >= end` in a `timestamp-range` widget; inline red warning shown in `WidgetRenderer.svelte` before save attempt. i18n key `timestamps.order_error` added (EN + JA).
2. **Gatekeeper click feedback** — Yes/No buttons now show `…` immediately on click using `await tick()` to force a Svelte DOM flush before any sync/async work. Fixes the `gateMode === 'continue'` case where `saving` was set and cleared in one synchronous pass (Svelte batched the update and no visual feedback appeared).
3. **Video prefetch** — `VideoPlayer.svelte` exports `getStimulusVideoUrl()` from a module-level script block. The phase page derives `nextVideoUrl` for the upcoming item (both regular and review phases) and injects `<link rel="prefetch">` in `<svelte:head>` to reduce inter-stimulus latency.
4. **Audio responses displayed as players** — Saved source-phase audio responses (paths matching `audio/…webm`) in `ReviewItemDisplay.svelte` now render as `<audio controls>` players instead of raw storage paths. Same fix applied to both saved-response blocks in `+page.svelte`.
5. **Completion "stay on page" dead-end** — After dismissing the completion modal with "Stay on page", a persistent indigo banner now appears above the progress bar. Clicking it re-opens the modal with all navigation options.
6. **Review phase save rejecting all widgets** — `save/+server.ts` was using `phase.responseWidgets ?? phase.reviewConfig?.responseWidgets`. Because Zod defaults `responseWidgets` to `[]`, the nullish coalescing never fell through to `reviewConfig.responseWidgets`, making every widget ID unknown. Fixed by branching on `phase.type === 'review'`.

### Schema additions
- `TutorialStep.autoAdvance: boolean?` — when `true`, the overlay auto-advances ~400ms after the required validation action completes (click/input/play). Admin checkbox added in the tutorial step editor.
- `ReviewConfig.allowNavigation: boolean (default false)` — controls whether participants can freely jump between review items via `StimulusNav`. Defaults to sequential-only (previously unconfigurable and always enabled). Admin toggle added.

### Admin editor
- **Thicker borders** — All phase/widget/field/step cards changed from `border border-gray-200` to `border-2 border-gray-300` for visual clarity.
- **Reordering** — ↑/↓ buttons added to registration fields, tutorial steps, and response widgets in all phases. Buttons are disabled at array boundaries.

### Infrastructure
- **`scripts/sync-remote-to-local.js`** — New script: copies all data from remote Supabase (experiments, participants, responses, config versions, file uploads, pending invites) to local Supabase. Creates a fresh local admin user (`debug@local.dev`) with owner access to all experiments. Optional `--storage` flag copies storage bucket files. Uses `--admin-email` / `--admin-password` flags to customise credentials. Bucket is always set to `public: true` even if it pre-existed.
- **CSP local-dev fix** — `svelte.config.js` now uses Vite's `loadEnv` to read the mode-specific env file at startup. Previously `process.env.PUBLIC_SUPABASE_URL` was evaluated before Vite processed `.env.local-db`, so `--mode local-db` didn't whitelist `http://127.0.0.1:54321` in `media-src`/`connect-src`.

## Phase 8: Multi-session study tooling — chunking redesign, anchors, UI overhaul, audit fixes (2026-05-01)

A research study with paid raters across multiple sessions surfaced gaps in the chunking model, the participant UI, and the admin chunk-progress views. This phase resolves them as one coherent body of work.

### Schema additions
- `StimulusItem.isAnchor: boolean?` — marks a stimulus as a test-retest anchor. Flagged stimuli are replicated into every chunk by the auto-generator and re-engage the gatekeeper at each chunk visit.
- `ChunkingConfig.chunkOrder: 'sequential' | 'latin-square' | 'random-per-participant'` (default `sequential`) — controls how each participant traverses chunks. Latin-square / random rotates which chunk a given rater starts on, counterbalancing first-session learning effects.
- `BreakScreen.title` / `body` are now optional — when omitted the runtime falls back to localized platform defaults (`survey.break_default_title` / `body` in `en.json` / `ja.json`).
- `BreakScreen.disabled: boolean?` — explicit opt-out for the auto-engaged block-boundary modal.
- **No DB migration**: all additions live in JSONB-resident config; Zod defaults populate them on parse.

### Sentinel-key convention in `response_data`
- New `_chunk: <chunkSlug>` is injected by the client into every response saved on a chunked URL. Mirrors the existing `_timestamp` pattern.
- All consumers that iterate widget keys now filter `!k.startsWith('_')` instead of hand-listing `_timestamp`. Prevents `_chunk` from ever rendering as a widget answer or counting as non-empty content.
- The save endpoint validation explicitly bypasses `_`-prefixed keys; widget IDs are user-defined and never start with underscore.

### Chunk auto-gen overhaul (`balancedStrataAssign`)
- New `balancedStrataAssign(items, balanceKeys[], C, B, seed)` in `src/lib/utils/index.ts` — splits stimuli across C chunks × B blocks with per-cell balance across one or more metadata keys (e.g. emotion + performer rank).
- Anchors are pulled from the regular pool and replicated **once per chunk**, distributed round-robin across that chunk's blocks. 5 anchors × 6 chunks = 30 presentations (not 90 per-block).
- Distribution is column-major (cycle chunks before blocks) so each chunk gets every stratum before any chunk takes a second draw.
- Admin UI (`ChunkingSection.svelte`) rewritten off `document.getElementById` onto bound `$state`. New form: `numChunks`, `blocksPerChunk`, multi-select `balanceKeys` from `metadataKeys`. New select `Chunk Order` alongside Block Order / Within-Block Order. Per-block balance preview line shows live counts: `30 reg · +2 anchors · emotion: anger×4 fear×4 joy×4 sadness×4`.

### Per-participant chunk traversal
- New `resolveChunkOrder(items, mode, participantIndex, participantId)` in `src/lib/utils/index.ts` — pure function shared by participant flow, server-side routing, and admin views.
- New `src/lib/server/chunk-routing.ts` — extracts `resolveParticipantNextChunk` (formerly private `computeNextChunk` in `auth/+server.ts`), now imported by `auth/+server.ts` (login flow), `complete/+page.server.ts` (premature-finish redirect), and the chunked phase server load.
- Tutorial-completion redirect (`tutorial/+page.server.ts` + `+page.svelte`) now uses the participant's first-chunk-in-rotation, NOT `chunks[0]`. Without this, every participant landed on chunk-1 first regardless of their assigned order.
- `nextChunkUrl` derivation in the phase page (`+page.svelte`) now finds the **first incomplete chunk in the participant's order**, not `ordering[idx + 1]`. Self-recovers from out-of-order completions.
- `chunks[0]` fallbacks removed from `firstPhaseUrl` (landing page) and `handleTutorialComplete` (tutorial). For chunked experiments, callers MUST use server-resolved URLs; if null, navigate to `/e/${slug}` so the login flow re-resolves.

### Per-chunk anchor accounting (test-retest reliability)
- **The bug**: pre-fix, an anchor rated in chunk-1 had its ID in `responseStore.completedStimuli` permanently. In chunk-3 the gatekeeper suppressed widgets ("you've already answered this") and the StimulusNav button showed green ✓ — the participant never re-rated it. **Test-retest data was silently lost.**
- **The fix** — `chunkCompletion: Map<id, 'completed' | 'skipped'>` derived in the phase page. Single source of truth for "is this stimulus done IN THIS CHUNK?":
  - Regular stimuli: present if any prior response exists.
  - Anchor stimuli on a chunked route: present only if a prior response has `_chunk === chunkSlug`.
  - Legacy responses without `_chunk` (pre-fix): treated as belonging to the participant's first chunk in their ordering.
  - 'completed' vs 'skipped' depends on whether the in-scope responses have any non-null widget value.
- **All chunk-aware consumers consolidated** onto `chunkCompletion`: progress bar, `checkCompletion`, block-info count, `gateMode`, `resetForCurrentItem`, first-incomplete landing, autoSkip duplicate-check, both StimulusNav `completionMap` props.
- **Anchor blinding**: the saved-responses card filters `currentResponses` to current-chunk-only when the stimulus is an anchor — prior-chunk ratings are hidden from the rater so they give a fresh judgment.
- `responseStore.completedStimuli` retains its **global** semantic ("any rating, any chunk"), used only by callers that genuinely want global state (skip-rule evaluation, the `allowRevisit=false` revisit guard).

### Participant UI redesign (Phase 8.4 — pilot-driven)
- **B1 — Cooldown banner is now a live indicator**, not a modal trigger. During cooldown: non-clickable "Next session unlocks in 9m 44s." When elapsed: clickable green "Start next session →" that navigates directly. No more modal-oscillation loop.
- **B2 — `formatDuration(min)` helper** in `src/lib/utils/index.ts` renders `"10 min"` / `"1h"` / `"1h 30m"` correctly. Modal copy uses **remaining** time (anchored to last-response timestamp), not the configured duration. Reload mid-cooldown shows the right count, not a reset.
- **B3 — First-incomplete landing** (server-side computed `firstIncompleteIndex` for chunked routes; client falls back to `items` for non-chunked). Defensive UI: navigating back to a completed stimulus with `allowMultipleResponses=false` now shows "You've already answered this. Pick another to continue" instead of a silent blank.
- **B4 — Tightened `.container` padding** (top 2rem → 0.75rem), removed duplicate participant-name row, inlined block-info into the progress-bar row. Saves ~80–100 px so gatekeeper buttons stay above the fold on 1280×720.
- **B5 — Retry button** appears next to landing-page error messages with re-run capability.

### Tier 2 polish
- **Numeric labels in StimulusNav** — falls back to "1, 2, 3..." (block-relative) when no `item.label` set, replacing noisy auto-generated IDs like `s0467-2`.
- **Time format `m:ss.cs`** via new `src/lib/utils/time-format.ts` — applied in widget capture display, ReviewItemDisplay timestamp pairs, saved-responses preview.
- **Friendlier saved-responses preview** — uses widget labels, collapses timestamp pairs into "Most important moment: 0:01.05 → 0:03.50".
- **Block-segmented thicker progress bar** — h-3 indigo bar with subtle white dividers at block boundaries (when chunked).
- **Welcome-back toast** on existing-account login (sessionStorage flag, auto-fades 3s).
- **Logout confirmation modal** in `Header.svelte` — applies to all four pages (landing, tutorial, phase, complete).
- **Dedupe registration welcome** — removed the platform-level banner; experiment's own intro heading is the single welcome.
- **A11y icons in StimulusNav** — `✓` for completed, `–` for skipped, dual-encoded with color for color-vision-deficient users. Aria-labels announce state.
- **Subtler highlight pulse** — `ring-4` replaced with 600 ms outline-fade animation (with `prefers-reduced-motion` fallback to a static 1s outline).
- **Encouraging break-screen copy** — auto-engages at every block boundary with platform defaults when the researcher hasn't customized title/body. New `chunking.breakScreen.disabled: true` opts out.
- **Wider participant viewport** — new `.participant-container` (1100 px max-width) for the chunked phase page; admin pages keep `.container` at 800 px.
- **Reduced StimulusNav noise** — collapsed-by-default below the response widgets. Compact "← Prev | Item 12 of 32 · Jump to… | Next →" strip replaces the always-on row of N buttons. Forward navigation across block boundaries respects the break-screen modal via the new `navigateToIndex` helper.

### Admin chunk-progress refactor
- `getChunkProgress` (`src/lib/server/admin.ts`) now bulk-ranks participants once at the top (was N×2 DB calls; now 1 query) and resolves each participant's chunk traversal order via `resolveChunkOrder`.
- New return shape: `{ progress: ChunkProgressEntry[], nextChunk: { slug, canStartAt } | null }` per participant. Admin client reads `nextChunk` directly — no array walks.
- Admin "next chunk URL" link now respects per-participant order. Pre-fix, a participant on a latin-square rotation could see the wrong "next URL" copied from the admin page.

### `/complete` page defense-in-depth
- Server load now redirects participants with incomplete chunks back to their next-incomplete chunk URL, using the same `resolveParticipantNextChunk` as the login flow. Bookmarked or manually-typed `/complete` URLs no longer let a participant render the completion page prematurely.

### CSV merge & bulk-import improvements
- `scripts/merge-summary-csvs.js` — combines arbitrary `Summary_*.csv` files into a single import-ready file with `id`, `filename`, and per-row metadata columns. Used to consolidate 4 source files into a 1846-row stimuli list.
- `scripts/list-storage.js` + `scripts/check-csv-vs-storage.js` — diagnostic utilities for cross-checking CSV filenames against actual storage contents.
- **`BulkImportModal.svelte` improvements**:
  - Storage cross-check at parse time: each row is verified against the live storage list; rows whose filename isn't found in storage get a red `missing` badge (and are deselected by default in the preview).
  - Optional `id` column in the CSV — when present, the explicit ID wins over the slugified filename. Lets researchers pre-anonymise IDs (e.g., `s0001`) without losing the storage-mapping `filename` column.
  - Optional `isAnchor` column — truthy values (`true`/`1`/`yes`) flag the stimulus as a test-retest anchor at import time.
  - Storage-check endpoint paginates with `?all=true` (was silently capped at 200; the modal already sent `all=true` but the server ignored it).

### Admin: per-participant session timing surface
- `getParticipantSessionTimings(experimentId, participantId)` in `src/lib/server/admin.ts` — pure compute over `responses` rows; returns one row per chunk attempted with `startedAt`, `endedAt`, `durationSeconds`, `responseCount`. No schema changes.
- New "Sessions" table on the participant detail page surfaces these for payment tracking (multi-session paid-rater studies).

### Audit-driven cleanup (post-pilot, 2026-05-01)
A read-only audit after the UI redesign + pilot turned up 6 silent bugs from per-participant chunk-order assumptions, plus the progress-bar 198% bug and the per-chunk anchor accounting gap. All resolved as F0–F7 on top of Phase 8 above:

- **F0** Progress bar `completedCount` switched to `chunkCompletion.size` (was `responseStore.completedStimuli.size`, global → 198% bug for multi-chunk participants).
- **F1** Admin chunk-progress refactor (per-participant ordering + bulk-rank optimization, see above).
- **F2 / F3** Removed `chunks[0]` fallbacks from `firstPhaseUrl` and `handleTutorialComplete` (defensive code that had silently misrouted in the tutorial bug).
- **F4** `navigateToIndex` helper centralizes boundary-aware navigation; `gotoNext` / `gotoPrev` / Jump-to / `handleItemSelect` all delegate to it. Forward-cross-boundary triggers the break-screen modal; backward navigation skips it.
- **F5** `/complete` server-side redirect (above) + extracted `resolveParticipantNextChunk` shared helper.
- **F6** First-incomplete landing extended to non-chunked phases.
- **F7** Per-chunk anchor accounting (above) — the deepest change. Includes the canonical `chunkCompletion` derivation, all consumers consolidated, save endpoint accepts `_chunk`, autoSkip uses `getNextResponseIndex(stimulusId)` to avoid unique-constraint collisions on anchor re-skips.

### Pilot-bug-prevention pass (caught before any participant ran the new flow)
- **Save endpoint widget validation** rejected `_`-prefixed sentinels with `400 Unknown widget: _chunk` — would have silently broken every save on a chunked URL. Fixed: bypass `_`-prefixed keys.
- **`autoSkipStimulus` hardcoded `responseIndex: 0`** — auto-skipping an anchor in a second chunk would hit a `(participant, phase, stimulus, response_index)` unique-constraint violation. Fixed: pass `getNextResponseIndex(stimItem.id)`.
- **Three places hand-listed `_timestamp`** in widget-key filters (review-phase `filterEmpty`, `buildSavedEntries`, the green review saved-reasoning card, and `ReviewItemDisplay`). Each would have shown `_chunk` as a widget answer. Fixed: switched to `!k.startsWith('_')`.
- **Anchor blinding leak in `currentResponses`** — saved-responses card showed prior-chunk anchor ratings, biasing test-retest. Fixed: scope `currentResponses` to current chunk for anchors.

### Tests
- 176 unit tests passing (was 150 before Phase 8). Added: `formatDuration`, `formatTimestamp`, `balancedStrataAssign` (across-chunk balance, anchor distribution, B=1 edge, deterministic seed), bulk-import explicit `id` + `missingInStorage` + `isAnchor`, save-endpoint sentinel-key bypass.
- E2E specs unchanged in count (most older specs continue to pass; new flows pending E2E coverage).

### Cleanup pass — anchor / sentinel logic deduplicated into shared helpers
After F0–F7 + the pilot-bug-prevention pass landed, a code-quality review surfaced two recurring duplications:

1. **`_`-prefix sentinel filter** — the `Object.entries(rd).filter(([k]) => !k.startsWith('_'))` pattern appeared in **7 places** across client and server (`responseStore.completedStimuli`, phase-page review `filterEmpty`, phase-page `chunkCompletion`, `buildSavedEntries`, review saved-reasoning render template, `ReviewItemDisplay.svelte`, save endpoint widget validation). Each was a separate fix during F7 — generalized away from hand-listed `_timestamp` but still copy-pasted.
2. **Anchor-completion check** — "is this anchor satisfied for this chunk?" duplicated in **5 places** (`chunkCompletion` per-item, phase `nextChunkUrl` `isChunkDone`, server `resolveParticipantNextChunk`, server `getChunkProgress`, plus the `currentResponses` blinding filter). Each had subtly different fallbacks for legacy untagged data (strict / first-chunk-only / tolerant-everywhere), making the semantics inconsistent across three call paths.

**Resolution** — extracted `src/lib/utils/response-data.ts` with five pure helpers:
- `widgetEntries(rd)` / `widgetKeys(rd)` — strip sentinel keys; replaces all 7 hand-rolled filters.
- `isAllNullResponse(rd)` — replaces inline "all widget values null" checks (gatekeeper-No / skip-rule detection).
- `inScopeForChunk(item, chunkSlug, responses)` — filter responses to those that count for this chunk view. Anchor-aware. Same helper services completion checks AND test-retest blinding.
- `isStimulusDoneInChunk(item, chunkSlug, responses)` — convenience wrapper around `inScopeForChunk(...).length > 0`.

**Semantic reconciliation**: the three different "untagged legacy" fallbacks were unified to **STRICT** — untagged anchor responses do NOT count for any chunk. Rationale: tolerant fallback silently regresses test-retest reliability. Launch policy is "reset participants and re-run"; legacy data is undefined behavior. Documented in helper docstring.

**Surface area collapsed**:
- `responseStore.completedStimuli` — 9 lines → 8 lines (uses `isAllNullResponse`).
- Phase-page `chunkCompletion` derivation — 30 lines → 18 lines (uses `inScopeForChunk` + `isAllNullResponse`).
- Phase-page `nextChunkUrl` `isChunkDone` — 13 lines → 7 lines (uses `isStimulusDoneInChunk`).
- Phase-page `currentResponses` filter — 9 lines → 6 lines (uses `inScopeForChunk`).
- Phase-page `buildSavedEntries`, review-phase saved-reasoning render, review `filterEmpty` — each switched to `widgetKeys` / `widgetEntries` / `isAllNullResponse`.
- `ReviewItemDisplay.svelte` key iteration — uses `widgetEntries`.
- `save/+server.ts` widget validation — uses `widgetKeys`.
- `chunk-routing.ts` `resolveParticipantNextChunk` — 30 lines → 15 lines (uses `isStimulusDoneInChunk`).
- `admin.ts` `getChunkProgress` — 35 lines → 20 lines (uses `isStimulusDoneInChunk`).

**Tests** — added [`src/lib/utils/response-data.test.ts`](src/lib/utils/response-data.test.ts) with 15 cases covering: sentinel filtering with mid-string underscores, all-null edge cases, non-anchor pass-through, non-chunked-route pass-through, strict-untagged rejection (regression test for the test-retest invariant), anchor-on-non-chunked-route fallback. **Final test count: 191** (was 176).

**Deliberately NOT extracted**: save-time `responseData._chunk = chunkSlug` injection (3 sites — one-line writes, helper would obscure rather than centralize); `getParticipantSessionTimings` chunk attribution (different question shape — "which chunk does this individual response belong to?" is not a completion check); skip-rule / branch-rule condition evaluators (still global — rules typically don't condition on anchors).

### Non-goals (out of scope)
- Per-stimulus `allowMultipleResponses` schema field (anchors handle multi-response implicitly via `isAnchor`).
- Williams (digram-balanced) chunk order — latin-square gives N rotations sufficient for first-position counterbalancing; chunks aren't analysis conditions in this study.
- Williams-style anchor positioning constraints (currently anchors random-shuffle alongside regulars within each block).
- Backwards-compat migration for pre-fix anchor responses without `_chunk` (recommendation: reset participants and re-run; a SQL backfill is possible if existing data must be preserved).

## Holistic audit + consolidation (2026-05-01)

A six-pass holistic audit of the codebase (~14K LOC across Svelte components and TypeScript, plus 24 SQL migrations) surfaced ~600 LOC of duplicated code, one latent participant-facing i18n bug, and one upload-validation gap. All resolved as Waves 1-6 below; full risk analysis and per-wave rationale lives in `.claude/plans/i-need-a-global-splendid-narwhal.md`.

**Verification across the whole effort: `npm run check` 0 errors · `npm run test` 192/192 passing (was 173 + 19 new response-save tests).**

### Wave 1 — Quick wins (~300 LOC removed, 1 security gap closed)

- **`detectAudioType()` wired into `uploadFile()`** ([src/lib/server/data.ts](src/lib/server/data.ts)) — the upload endpoint validated the client-supplied `Content-Type` header but never the actual bytes. Now reads the first 8 bytes and rejects mismatches. Closes a real security gap (a client could spoof `Content-Type: audio/webm` with arbitrary bytes).
- **Dead code deletion** — `obtainDate()` ([src/lib/utils/index.ts](src/lib/utils/index.ts)), `escapeHtml()` ([src/lib/utils/html-escape.ts](src/lib/utils/html-escape.ts)), `validateSafeId()` + `sanitizePath()` ([src/lib/utils/sanitize.ts](src/lib/utils/sanitize.ts)). `sanitizePath` was the deprecated insecure path-validation approach that was explicitly replaced by the segment-level whitelist in `uploadFile()` — leaving it around was a security hazard. `validateSafeId` is functionally equivalent to the inlined `segmentRe` in `uploadFile`. `escapeHtml` was scaffolded for a TutorialOverlay use case that turned out to want HTML pass-through (admin-trusted input). Net: 4 source files + 4 test files deleted.
- **`saveConfigVersion()` removed** ([src/lib/server/admin.ts](src/lib/server/admin.ts)) — only the definition existed, no callers (superseded by `saveConfigWithVersion`). The underlying `insert_config_version` Postgres RPC is **NOT** dropped yet; queued for a follow-up migration after one stable release cycle (per the no-quick-patch principle for forward-only migrations).
- **Schema merge** — `FieldOption ≡ WidgetOption` collapsed to a shared `Option` schema in [src/lib/config/schema.ts](src/lib/config/schema.ts) with both names kept as aliases for zero breaking change.
- **Audio-path consolidation** — new `AUDIO_PATH_PATTERN` constant + `isAudioPath()` type guard + `extractAudioPaths()` helper in [src/lib/utils/response-data.ts](src/lib/utils/response-data.ts). 5 inlined-regex sites + 2 duplicated functions → 1 helper.
- **Audit logging on data export** ([src/routes/admin/experiments/[id]/data/export/+server.ts](src/routes/admin/experiments/[id]/data/export/+server.ts)) — research-data exports now write `data.export` rows to `admin_audit_log` with format/style/filter metadata. Operator-level dumps reviewable after the fact.
- **`unwrap()` / `unwrapVoid()` Supabase helpers** in new [src/lib/server/db.ts](src/lib/server/db.ts) — eliminated ~50 LOC of `if (error) { console.error; throw }` boilerplate across `data.ts`, `admin.ts`, `collaborators.ts`. Opt-in per callsite — sites that branch on `error.code` (23505, P0004, P0005) and the discriminated-union `auth.admin.listUsers()` site stay inline.
- **`findUniqueSlug()` helper** for the slug-collision probe in `duplicateExperiment` ([src/lib/server/admin.ts](src/lib/server/admin.ts)).
- **`isChunkingEnabled()` predicate** extracted to [src/lib/server/chunk-routing.ts](src/lib/server/chunk-routing.ts) and used in both login and register actions of [src/routes/e/[slug]/auth/+server.ts](src/routes/e/[slug]/auth/+server.ts).

### Wave 2 — Admin page composables (~150 LOC removed, 9 files affected)

- **`<Toast>` + `ToastState` rune class** ([src/lib/components/admin/Toast.svelte](src/lib/components/admin/Toast.svelte), [src/lib/utils/toast.svelte.ts](src/lib/utils/toast.svelte.ts)) — replaces the per-page `let toast = $state<...>(null); setTimeout(... null, 3000)` boilerplate that was duplicated across 8 admin pages plus CollaboratorsPanel. Single-toast-at-a-time by design (matches existing UX exactly; stacking is a feature change).
- **`preserveFields` + `withLoadingFlag()` enhance helpers** ([src/lib/utils/enhance.ts](src/lib/utils/enhance.ts)) — replaces 11 inline `use:enhance={() => { setX(true); return async ({update}) => { await update({reset:false}); setX(false); } }}` blocks. `withLoadingFlag` accepts an optional after-callback for additional cleanup (e.g. closing a confirm modal).
- **Admin display helpers** ([src/lib/utils/admin-display.ts](src/lib/utils/admin-display.ts)) — `localizedTitle`, `localized`, `configTitle`, `participantName`, plus typed `STATUS_COLORS` (exhaustive over `ExperimentStatus`). Three pages used to redefine these helpers identically.
- **Date formatters** ([src/lib/utils/format-date.ts](src/lib/utils/format-date.ts)) — `formatDate` and `formatDateTime` with explicit `'en-US'` locale default. Migrated 7 `toLocaleString()` / `toLocaleDateString()` sites that previously used the browser default locale (which was inconsistent with the rest of the admin UI).

### Wave 3 — `<FormInput>` (text/textarea unification, ~22 inline class strings collapsed)

- **`<FormInput>` component** ([src/lib/components/admin/FormInput.svelte](src/lib/components/admin/FormInput.svelte)) with `size: 'sm' | 'xs'`, `mono`, `multiline + rows`, `error` props and standard ARIA pass-through. Migrated `MetadataSection`, `LocalizedInput` (highest leverage — every config section using LocalizedInput benefits transitively), `RegistrationSection`, `CompletionSection`, and the inline number inputs in `PhasesSection`.
- Did NOT migrate `<select>` elements (different element shape — separate concern), or highly customized inputs in StimuliSection / ChunkingSection / TutorialSection / BulkImportModal where escape-hatch props would defeat the consolidation.

### Wave 4 — Component extractions (~150 LOC removed)

- **`<ConfirmationModal>`** ([src/lib/components/admin/ConfirmationModal.svelte](src/lib/components/admin/ConfirmationModal.svelte)) — replaces 3 magic-phrase modals (settings delete-experiment, participant reset, participant delete). Magic phrase stays in English by design (typing 削除 is too easy).
- **`<AddButton>` + `<RemoveButton>`** ([src/lib/components/admin/](src/lib/components/admin/)) — `type="button"` hardcoded (CLAUDE.md gotcha protection). 17 inline AddButton sites migrated across PhasesSection (10), RegistrationSection (3), ChunkingSection (2), CompletionSection (2).
- **`<PaginationStrip>` snippet + `toggleSetMember()` helper** in [BulkImportModal.svelte](src/lib/components/admin/config/BulkImportModal.svelte) — collapses 2 byte-identical pagination blocks and 2 byte-identical Set-toggle functions. Did NOT extract the `selectAllFiltered`/`selectAllPreviewFiltered` pair — different iteration shapes, generic would add noise.
- **`collectRegistrationKeys()` helper** in [data/export/+server.ts](src/routes/admin/experiments/[id]/data/export/+server.ts) — 18-line key-collection block deduplicated across research-merge and raw-CSV paths.

### Wave 5 — i18n cleanup

- **Break-screen i18n bug fix** (participant-facing) — added `survey.chunk_break_title` / `_body` / `_until` / `_ready` / `_continue` keys to `en.json` + `ja.json` with proper translations. Wired into [src/routes/e/[slug]/+page.svelte](src/routes/e/[slug]/+page.svelte). The strings ("Time for a break!", "You've completed a chunk...") were the only hardcoded English on the participant-facing surface — the rest is i18n'd.
- **Translation key consolidation** — `survey.continue` / `tutorial.continue` / `survey.of` / `tutorial.of` removed; consolidated to `common.continue` and new `common.of`. Verified the JA values were byte-identical (続ける × 3, "/" × 2) before merging. The 3 callsites in TutorialOverlay updated.
- **Admin UI is English-only by design** — documented in CLAUDE.md as a deliberate scope decision (small audience, would also need a pre-login language toggle, the bilingual surface that matters is participant-facing). Future contributors should not silently wire `i18n.platform()` into admin pages.

### Wave 6 — Phase page service + leaf components

- **`src/lib/services/response-save.ts`** — extracted: `validateWidgets`, `buildResponseData`, `buildSkipResponseData` (pure helpers, generic over widget type), `uploadAudioBlobs` and `persistResponse` (transactional fetch wrappers). The `(audio upload, response save)` sequence stays transactional (failed audio = no half-saved response).
- **19 new unit tests** ([src/lib/services/response-save.test.ts](src/lib/services/response-save.test.ts)) covering validation edge cases (empty/null/whitespace, required+visible filtering, timestamp ordering), payload assembly (audio path mapping, hidden-widget nulling, `_chunk` sentinel), skip-response shape.
- **`handleSave` / `handleNo` refactored** ([src/routes/e/[slug]/[phaseSlug]/+page.svelte](src/routes/e/[slug]/[phaseSlug]/+page.svelte)) — ~60 lines of inline pipeline logic replaced with service calls. Page state (saving, message, audioBlobs) stays in the page; logic moves out.
- **3 leaf components extracted** to `src/lib/components/participant/`: `<GatekeeperPrompt>` (yes/no UI), `<BreakModal>` (countdown + dismiss), `<BlockProgress>` (progress bar wrapper).
- **Phase page: 1414 → 1335 lines** (plus ~60 LOC moved into the response-save service).
- **Deferred from Wave 6**: `<CompletionModal>` and `<NavStrip>` extractions. Both are pure UI moves but require state-lifting prep + manual headed E2E. Not blocking any functionality; queued as a focused follow-up PR. Detailed analysis in the audit plan file.

### Optional cleanup

- **`scripts/storage-utils.js`** — `listAll()` helper extracted; both [scripts/list-storage.js](scripts/list-storage.js) and [scripts/sync-remote-to-local.js](scripts/sync-remote-to-local.js) now import it. Single source of truth for recursive bucket listing.
- **`package.json` race scripts** — added `npm run test:race:chunk`, `:config`, `:burst` invoking the previously-invisible scripts under `scripts/race/`.
- **`createTestExperiment()` E2E fixture** — extracted to [tests/e2e/fixtures.ts](tests/e2e/fixtures.ts); `admin.spec.ts` and `collaborators.spec.ts` updated to use it instead of duplicating the goto + fill + click + waitForURL sequence.

### Still on the books

- ~~**`insert_config_version` Postgres function drop** (migration 025)~~ — RETIRED 2026-05-02. The 2026-05-02 pre-launch ledger probe found that migration 010 was never applied to prod, so the function never existed there in the first place. Migration 025 is permanently retired; slot 025 stays empty.
- **`<CompletionModal>` and `<NavStrip>` extractions** — see Wave 6 above; queued for a focused PR with manual headed E2E.
- **`cleanup_rate_limits` scheduling** — Postgres function exists but has no scheduled invocation. Already on FUTURE_PLANS.md as near-term work.
- **GIN index audit** — `idx_participants_registration` and `idx_responses_data` on JSONB columns. No app code uses JSONB operators (`@>`, `->`, `?`) on these columns. Safe to drop after grep-verification but no urgency.

## Tech debt cleanup — Wave 6 leftovers + WidgetRenderer split + schema runbook + GIN drop migration (2026-05-02)

Six items from FUTURE_PLANS + the 2026-05-01 audit's deferred Wave 6 leftovers, all shipped together. Plan + per-item risk analysis live in `.claude/plans/i-need-a-global-splendid-narwhal.md`.

**Verification: `npm run check` 0 errors · `npm run test` 192/192 passing · `npm run check-configs:fixtures` 3/3 fixtures clean.**

### `<CompletionModal>` extraction (split into two PRs)

**PR1 — state-lift**: introduced `CompletionState` discriminated union + `completionCopy` derived in the phase page script. The 4 completion variants (next-phase, next-chunk-cooldown, next-chunk-ready, finish) are now disambiguated once via `$derived.by` instead of re-derived inline. Behavior preserved — the existing `<Modal>` markup just consumed the new derivations.

**PR2 — component extraction**: created [src/lib/components/participant/CompletionModal.svelte](src/lib/components/participant/CompletionModal.svelte) with `<script module>` exporting the `CompletionState` type. The component pattern-matches on `state.kind`; all SvelteKit navigation (`goto`, `window.location.href`) stays in the parent via `onContinue` / `onFinish` / `onStay` / `onClose` callbacks. Component never imports `goto` — keeps the leaf decoupled from the navigation API.

Buttons hardcode `type="button"` per CLAUDE.md gotcha (CompletionModal isn't inside a form today, but the component must be safe in any future caller).

### `<NavStrip>` extraction (single PR)

Created [src/lib/components/participant/NavStrip.svelte](src/lib/components/participant/NavStrip.svelte). Replaced both `{#if navAllowed && !isReviewPhase}` / `{:else if navAllowed && isReviewPhase}` branches in the phase page with a single `<NavStrip>` call. Caller resolves the middle counter label (`"Item 12 of 32"` for stim-resp using block-aware counts vs `"3 / 8"` for review using raw indices) — component stays free of `{#if isReviewPhase}` checks.

Anti-pattern avoided: did NOT add a `mode: 'stimulus' | 'review'` discriminator. Caller-resolved label keeps logic in the right place.

### WidgetRenderer split

[src/lib/components/widgets/WidgetRenderer.svelte](src/lib/components/widgets/WidgetRenderer.svelte) went from 221 → 71 lines. Each of the 9 widget types now lives in its own file under `src/lib/components/widgets/types/`: TextWidget, TextareaWidget, SelectWidget, NumberWidget, LikertWidget, TimestampRangeWidget, SliderWidget, MultiselectWidget, AudioRecordingWidget.

The label header (`widget.stepLabel` vs `widget.label` + optional indicator) stays in the parent — every type-component would otherwise duplicate it 9 times.

**Spike finding**: `<svelte:component>` is **deprecated in Svelte 5 runes mode**. The dispatch uses the modern pattern: a capitalized variable referring to a component (`const Component = $derived(TYPES[widget.type])`) is dynamic by default — just `<Component {widget} bind:value ... />` works. Updated the plan to reflect this.

`TimestampRangeWidget` hoists its derived values from `{@const}` to `$derived` script-level expressions (the original WidgetRenderer used `{@const}` inside an `{#if widget.type === 'timestamp-range'}`, which was valid; in the extracted file the same `{@const}` placement violated the CLAUDE.md gotcha because it was at component-root level).

**Phase page after Wave 6 + this work: 1335 → 1285 lines** (NavStrip removed two duplicated branches; CompletionModal moved markup out at the cost of state-lift derivations).

### Schema migration runbook (Layer 1 + Layer 2 implemented; Layer 3 deferred)

- **Layer 1** — `npm run check-configs` script added to [package.json](package.json). Reads prod configs (via `.env`), applies migration rules, re-validates against current schema. Documented in CLAUDE.md under "Schema migration runbook" with explicit triage flow (add migration rule / write SQL fix / reject schema change).
- **Layer 2** — [scripts/check-configs-against-fixtures.ts](scripts/check-configs-against-fixtures.ts) loads every JSON file under `tests/e2e/fixtures/`, applies migration rules, validates each against `ExperimentConfigSchema`. Wired into CI as a step after `npm run test` in [.github/workflows/ci.yml](.github/workflows/ci.yml). No Supabase credentials needed — the existing E2E fixtures (full-feature, chunking, tutorial) ARE the representative shapes.
- **Layer 3** — pre-deploy gate (would require service-role key in deploy-env secrets) explicitly deferred. Documented in FUTURE_PLANS as an ops decision.

The fixture-based gate would have caught (during the audit pass) any schema change that broke a known config shape. Now any future schema change will get the same automatic check.

### Drop unused GIN indexes (migration 026, NOT YET APPLIED)

Migration file [supabase/migrations/026_drop_unused_jsonb_gin_indexes.sql](supabase/migrations/026_drop_unused_jsonb_gin_indexes.sql) written but **deliberately not applied**. The file drops:
- `idx_responses_data` — verified zero JSONB-operator callers in app code or migrations
- `idx_participants_registration` — used only by the one-shot `migrate_select_or_other_for_experiment` RPC (sequential scan acceptable for a manual retrofit; future migrations needing GIN can recreate)

Both indexes cost write throughput on every insert/update without serving steady-state queries. The migration documents:
- Why no `CONCURRENTLY` (Supabase wraps migrations in transactions)
- Pre-application checklist (backup verification + 1-week `pg_stat_user_indexes` observation window + low-traffic deployment)
- Manual `psql CREATE INDEX CONCURRENTLY` rollback recipe

Application requires the operator to run the prod `pg_stat_user_indexes` snapshot first.

### Translation key consolidation (note)

Already shipped in the 2026-05-01 audit. Mentioned here for completeness: `survey.continue` / `tutorial.continue` / `survey.of` / `tutorial.of` collapsed into `common.continue` and new `common.of`. Verified Japanese values were byte-identical (続ける × 3, "/" × 2) before merging.

### Documentation updates
- [CLAUDE.md](CLAUDE.md): added "Schema migration runbook" gotcha section
- [FUTURE_PLANS.md](FUTURE_PLANS.md): expanded `insert_config_version` drop entry with all triage points; updated status snapshot to 2026-05-02
- [docs/CHANGELOG.md](docs/CHANGELOG.md): this entry

### Still on the books

- ~~**Migration 026 application** (drop unused GIN indexes)~~ — applied to prod 2026-05-02 as part of pre-launch ledger alignment (see entry below).
- ~~**`insert_config_version` drop migration 025**~~ — retired 2026-05-02. Pre-launch ledger probe revealed migration 010 (which created the function) was never applied to prod. With nothing to drop, migration 025 is no longer needed; slot 025 stays permanently empty.
- **Schema runbook Layer 3** — pre-deploy gate, ops decision
- **`cleanup_rate_limits` scheduling** — pg_cron OR Vercel Cron OR GitHub Actions
- **Production database backups** — already on FUTURE_PLANS as near-term, enable in Supabase dashboard
- **Manual headed Playwright** for the new participant components — required before declaring CompletionModal / NavStrip / WidgetRenderer split complete in prod
