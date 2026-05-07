# CLAUDE.md

Config-driven experiment/survey platform for academic research. SvelteKit 5 + Supabase + Tailwind + Zod. One deployment serves unlimited experiments defined by JSON configs.

## Coding Philosophy

**Root-cause fixes, not band-aids.** When a bug surfaces, find the underlying cause and fix it there, even if the fix touches more files than the symptom. Avoid quick patches — special-case branches, suppressed warnings, `if this weird input then ...` guards — that mask the real problem and accumulate as scar tissue. If the proper fix is genuinely too large for the current change, document the trade-off explicitly in the commit message or a `# TODO:` rather than papering over it silently.

## Quick Commands

```bash
npm run dev          # Dev server → http://localhost:5173/ (online Supabase, uses .env)
npm run dev:local    # Dev server with local Supabase (uses .env + .env.local-db overrides)
npm run build        # Production build
npm run check        # svelte-check (type errors)
npm run test         # Vitest (unit + server-handler tests)
npm run test:e2e     # Playwright E2E (requires local Supabase running)
node scripts/seed.js # Seed experiment config into DB
```

## Switching between online and local Supabase

- `.env` — online Supabase credentials (committed, used by default)
- `.env.local-db` — local Supabase overrides (gitignored, used by `dev:local`)

`npm run dev` hits the online DB. `npm run dev:local` hits local Supabase at `http://127.0.0.1:54321`. Run `supabase start` before using the local mode.

## Running E2E tests locally

```bash
supabase start                          # starts Postgres + GoTrue + Storage in Docker
eval "$(supabase status -o env)"        # exports API_URL, ANON_KEY, SERVICE_ROLE_KEY
# .env.local-db holds local overrides — update it if your local keys change
export PUBLIC_SUPABASE_URL=$API_URL PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
npm run test:e2e                        # boots dev server via webServer + runs specs
supabase stop
```

The `tests/e2e/fixtures.ts` safety guard refuses any non-local `PUBLIC_SUPABASE_URL` (override only with `E2E_ALLOW_REMOTE=yes-i-know-what-im-doing` for disposable test projects). Don't disable it.

### Testing principles

When writing E2E specs OR briefing an agent to write them:

1. **Test like a real admin or participant.** Click visible nav links, don't `page.goto('/admin/…')`. Fill fields by their on-screen label, not testids. If the real user would land on the list and click through, the spec does the same.
2. **Verify through the UI, not the DB.** Setup + teardown can use the service-role client (faster, deterministic). But assertions that a feature works must read what a user would see — the list page, the toast, the rendered value. DB checks are supporting evidence on top, not a substitute.
3. **Cover what a real user could actually do.** Beyond the happy path: rename, hit Cancel halfway, reload mid-edit, paste malformed JSON, invite yourself, open in two tabs.
4. **Run headed when iterating.** Three options, in order of usefulness:
   - **Interactive UI** (best for stepping through): `npx playwright test --ui tests/e2e/...` — Playwright's official interactive runner with built-in step/replay/speed controls.
   - **Continuous run at watchable speed**: `./scripts/pw.js --headed --slowmo=200 tests/e2e/...` (or `npm run pw -- --headed --slowmo=200 tests/e2e/...`). The `pw` wrapper translates `--slowmo=N` (which Playwright doesn't expose at the CLI) into the `launchOptions.slowMo` config option via the `PW_SLOWMO` env var.
   - **Plain headed**: `npx playwright test --headed tests/e2e/...` — full speed, just visible.

   CI runs headless. If a page renders weirdly, you need to actually see it.
5. **Run `npm run check` and `npm run test` before claiming done.** Specs that pass at runtime can still ship TS errors that block CI.

## Architecture

- **Config-driven**: Experiment config (JSON → Zod → JSONB in Postgres) defines everything — registration, phases, stimuli, widgets, tutorials, completion
- **Two auth systems**: Participants use custom session tokens (httpOnly cookies); admins use Supabase Auth verified against `admin_users` table
- **Per-experiment collaborator roles**: Admins are not granted access to all experiments. Each experiment has rows in `experiment_collaborators(experiment_id, user_id, role)` where role ∈ {owner, editor, viewer}. Every admin route guards its experiment via `requireExperimentAccess(locals.adminUser, experimentId, minRole)` from `$lib/server/collaborators`. Owners can invite by email through `pending_invites` (claimed at next login)
- **Server-only mutations**: Browser never writes to Supabase directly. Anon key reads active experiment configs only; service role key handles all CRUD
- **Svelte 5 runes**: `$state` class stores in `.svelte.ts`, `$props()`, `$derived`/`$derived.by`, `$effect`, `$bindable`
- **Co-located tests**: `*.test.ts` files next to source (Vitest); E2E specs under `tests/e2e/` (Playwright, requires local Supabase)
- **Migrations**: Sequential in `supabase/migrations/` (001-021)
- **Audit + error logs**: Mutating admin actions write to `admin_audit_log`; unhandled 500s write to `error_log` via `reportError()` from `$lib/server/errors`
- **Postgres-backed rate limiter**: `checkRateLimit(ip, endpoint, ...)` in `$lib/server/rate-limit` calls the `rate_limit_check` RPC — survives serverless cold starts
- **Optimistic locking**: Config saves and rollbacks pass `expected_updated_at` through the `upsert_config_with_version` RPC; conflicts surface as `P0004` and become a 409 with the "modified by another admin" toast
- **CSP via SvelteKit nonces**: `kit.csp` mode `'auto'` — `script-src` is nonce-bound, no `unsafe-inline` in script-src

## Key Files

| What | Where |
|------|-------|
| Config schema + types | `src/lib/config/schema.ts` |
| Auth middleware + security | `src/hooks.server.ts` |
| Participant data layer | `src/lib/server/data.ts` |
| Admin data layer | `src/lib/server/admin.ts` |
| Collaborator access control | `src/lib/server/collaborators.ts` |
| Audit log helper | `src/lib/server/audit.ts` |
| Error reporting abstraction | `src/lib/server/errors.ts` |
| Postgres-backed rate limiter | `src/lib/server/rate-limit.ts` |
| Phase page (main survey UI) | `src/routes/e/[slug]/[phaseSlug]/+page.svelte` |
| Save endpoint | `src/routes/e/[slug]/[phaseSlug]/save/+server.ts` |
| Admin config editor | `src/lib/components/admin/ConfigEditor.svelte` |
| Response-save service (validation, audio upload, payload assembly) | `src/lib/services/response-save.ts` |
| Phase-page leaf components | `src/lib/components/participant/{GatekeeperPrompt,BreakModal,BlockProgress}.svelte` |
| Custom video scrubber (play/pause, slider, time, markers) | `src/lib/components/stimuli/MediaScrubber.svelte` |
| Replay controller (segment + full-highlight playback) | `src/lib/utils/replay.ts` |
| Tutorial popover side rules (extracted from TutorialOverlay for testability) | `src/lib/utils/tutorial-placement.ts` |
| Supabase result helper (`unwrap`, `unwrapVoid`) | `src/lib/server/db.ts` |
| Toast composable + component | `src/lib/utils/toast.svelte.ts`, `src/lib/components/admin/Toast.svelte` |
| `use:enhance` helpers (`preserveFields`, `withLoadingFlag`) | `src/lib/utils/enhance.ts` |
| Admin display helpers (`configTitle`, `localized`, `STATUS_COLORS`, `participantName`) | `src/lib/utils/admin-display.ts` |
| Admin date formatters (`formatDate`, `formatDateTime`) | `src/lib/utils/format-date.ts` |
| Reusable admin components (FormInput, ConfirmationModal, AddButton, RemoveButton) | `src/lib/components/admin/` |
| Storage script utility (`listAll`) | `scripts/storage-utils.js` |
| E2E fixtures + helpers | `tests/e2e/fixtures.ts`, `tests/e2e/seed.ts` |

## Gotchas

### `$derived` vs `$derived.by`
- `$derived(expr)` — simple reactive expression: `let x = $derived(a + b)`
- `$derived.by(() => {...})` — computed block that returns a value
- `$derived(() => {...})` (with arrow returning object) returns a **function**, not the computed value. Always use `$derived.by` for blocks.

### `Math.random()` in reactivity
Never use `Math.random()` inside `$derived.by` — it re-executes on every reactive update, reshuffling items. Use `seededShuffle()` from `$lib/utils` with a stable seed.

### Review phases use response UUIDs
Review phase `stimulusId` is the source response UUID, not a stimulus item ID. The save endpoint skips stimulus existence validation for `phase.type === 'review'`.

### `update({ reset: false })` in `use:enhance`
SvelteKit's `update()` calls `form.reset()` by default. Always pass `{ reset: false }` to preserve field values.

### `$effect` + `form` timing
After `update({ reset: false })`, `form` updates before `data` refreshes. Don't read `data` in a `$effect` triggered by `form?.success`.

### `$state` proxy mutations
Pass `$state` objects as props — children mutate the same proxy directly. Never `structuredClone(prop)` + callback + reassign.

### `redirect()` throws
SvelteKit `redirect()` throws internally. In try/catch: `if (isRedirect(err)) throw err`.

### Buttons in forms
All `<button>` inside `<form>` need explicit `type="button"` or `type="submit"` (HTML defaults to submit).

### `{@const}` placement
Must be an immediate child of `{#each}`, `{#if}`, `{:else}` blocks — not inside HTML elements within those blocks.

### Audit log writes must precede the cascade
`admin_audit_log.experiment_id` is a FK with `ON DELETE SET NULL`. The set-null rule fires when the parent is **later** deleted; inserting a child row that references an already-deleted parent violates the FK at INSERT time. So in delete actions, call `audit(...)` BEFORE `deleteExperiment(...)`. The audit row survives the subsequent cascade with a null `experiment_id` but intact `admin_user_id` / `action`.

### Round-robin participant ranking
`getParticipantIndex` in `$lib/server/data` ranks by `registered_at` ASC (with id tie-break for same-`now()` bulk inserts), NOT by lexicographic UUID. Latin-square / round-robin distributions depend on this. If you need to add a new ranking-based feature, reuse this function rather than reading `id` order.

### Config dirty-state comparison
The Save Config indicator (`●`) compares against a canonical key-sorted JSON of `data.experiment.config`, not raw stringify. Postgres JSONB doesn't preserve key order on read AND Zod fills in defaults on parse — naive `JSON.stringify` comparison shows phantom dirty state forever. Re-sync `configJson` / `configState` from `data.experiment.config` inside the `enhance` callback after `await update({ reset: false })`.

### Gatekeeper `gateMode` state machine
The phase page derives `gateMode: 'engage' | 'continue'` from whether any prior response exists for the current stimulus (`responseStore.byStimulus.get(currentItemId)?.length > 0`). This drives two behaviors:
- **`gatePrompt`**: picks `phase.gatekeeperQuestion.subsequent` (if configured) when `gateMode === 'continue'`, otherwise always `phase.gatekeeperQuestion.initial`.
- **`handleNo()`**: when `gateMode === 'continue'` → just advance to next stimulus, no DB write; when `gateMode === 'engage'` → write a skip row with JSON `null` per widget, then advance.

### `GatekeeperQuestion` schema shape
The gatekeeper uses a nested `{initial, subsequent?}` shape — NOT the old flat `{text, yesLabel, noLabel}`. Flat configs must be migrated with `scripts/migrate-configs.ts` before deploying code that reads the new shape. The E2E fixture at `tests/e2e/fixtures/full-feature-config.json` and all prod configs must use the nested shape.

### `select-or-other` field type — storage contract
The `select-or-other` registration field stores a **single string** in `registration_data[id]`: either a selected option's value string, or the participant's typed free-text when they chose "Other". The UI-only sentinel `__OTHER__` must NEVER be stored — it exists only in `SelectOrOtherField.svelte`'s local state to track which branch is active. When building analysis scripts, treat `registration_data[id]` as an opaque string; if the value matches no known option, it was typed free-text via the Other path.

### Skip rows write JSON null (not string)
Since the gatekeeper "No" handler fix, new skip rows store `null` (JSON null) per widget key — e.g. `{rating: null, comment: null}`. Legacy rows written before the fix may contain a string sentinel (e.g. `"null"`). Use `scripts/migrate-skip-rows.ts` to normalize legacy rows. When reading skip rows in analysis code, filter by `value IS NULL OR value = '<sentinel>'` until the normalization migration has run.

### Review phase widget lookup — branch on `phase.type`, not nullish coalescing
`phase.responseWidgets` is always `[]` (Zod default) even for review phases. Using `phase.responseWidgets ?? phase.reviewConfig?.responseWidgets` never reaches `reviewConfig.responseWidgets` because `[]` is not `null`/`undefined`. Always branch explicitly: `phase.type === 'review' ? phase.reviewConfig?.responseWidgets ?? [] : phase.responseWidgets ?? []`.

### `svelte.config.js` CSP and mode-specific env vars
`svelte.config.js` is evaluated as a Node.js module before Vite processes mode-specific env files. Using `process.env.PUBLIC_SUPABASE_URL` directly only sees the shell environment, not `.env.local-db`. The config uses `loadEnv(mode, cwd)` from `vite` to read the correct env for the active `--mode` flag. If you add new origins to the CSP that depend on env vars, use the same `env` object, not `process.env`.

### Gatekeeper click feedback requires `await tick()`
In `gateMode === 'continue'`, `handleNo()` is synchronous — setting and clearing `saving` in one pass. Svelte batches those updates and never flushes a DOM frame showing the intermediate state. Always `await tick()` after setting any visual-feedback state (e.g. `gatekeeperClicked`) before doing synchronous work that will immediately clear it.

### Local debugging with `sync-remote-to-local.js`
`node scripts/sync-remote-to-local.js [--storage]` copies all remote data to local Supabase and creates a local admin (`debug@local.dev` / `Debug1234!`). Run `supabase start` first. The script always sets the `experiments` storage bucket to `public: true` — the bucket may have been created as private in a previous local session.

### Sentinel `_`-prefix keys in `response_data` (Phase 8)
Beyond user-defined widget keys, the `response_data` JSONB blob holds system metadata under `_`-prefixed keys: `_chunk` (current chunk slug, injected by the client at every chunked save), `_timestamp` (legacy). Consumer convention: use the helpers in [`src/lib/utils/response-data.ts`](src/lib/utils/response-data.ts) — `widgetEntries(rd)`, `widgetKeys(rd)`, `isAllNullResponse(rd)`. DO NOT hand-roll `Object.entries(rd).filter(...)` or `k !== '_timestamp'` — those are historical patterns that drifted out of sync across 7 sites before being consolidated. The save endpoint also uses `widgetKeys` to validate against widget IDs.

### `chunkCompletion` is the canonical "is done in current chunk view?"
After Phase 8, the phase page derives `chunkCompletion: Map<id, 'completed' | 'skipped'>` once. It's the source of truth for: progress bar count, StimulusNav button colors, block-info count, `gateMode`, `resetForCurrentItem`, first-incomplete landing, autoSkip duplicate-check, `checkCompletion` allDone test. For an anchor stimulus, only counts as done if a response with `_chunk === chunkSlug` exists.

`responseStore.completedStimuli` retains a GLOBAL "any rating, any chunk" semantic — used only by callers that genuinely want global state (skip-rule evaluation, the `allowRevisit=false` revisit guard for non-anchor stimuli). DO NOT use `completedStimuli` for chunk-aware checks; reach for `chunkCompletion` instead.

**Server-side equivalents**: when computing chunk completion in server code (`getChunkProgress` in `lib/server/admin.ts`, `resolveParticipantNextChunk` in `lib/server/chunk-routing.ts`), use the shared `isStimulusDoneInChunk(item, chunkSlug, responses)` helper from `lib/utils/response-data.ts` — same semantic as the client-side `chunkCompletion`. Same helper services the test-retest blinding `currentResponses` filter via `inScopeForChunk(...)`. **Strict on legacy data**: untagged anchor responses don't credit any chunk; the launch policy is "reset participants and re-run."

### Per-participant chunk traversal — never `chunks[0]`
Every chunk-aware code path that needs "the next chunk for this participant" goes through `resolveChunkOrder` (`src/lib/utils/index.ts`) or `resolveParticipantNextChunk` (`src/lib/server/chunk-routing.ts`). The raw `config.stimuli.chunking.chunks` array is only safe for: array-order checklist displays (admin chips), Zod parsing, the auto-generator output shape. Anywhere else, `chunks[0]` / `chunks[idx + 1]` is a bug — it ignores latin-square / random-per-participant rotation. Tutorial→survey redirect, phase-completion `nextChunkUrl`, admin "next chunk URL" link, and `/complete` page all go through the resolver.

### `getNextResponseIndex(stimulusId)` for multi-chunk anchor saves
Anchors recur across chunks; each rating creates a new `responses` row with incremented `response_index`. Hardcoding `responseIndex: 0` violates the `(participant_id, phase_id, stimulus_id, response_index)` unique constraint when an anchor gets skipped twice. Always pass `getNextResponseIndex(stimulusId)` — it returns `byStimulus.get(stimulusId).length` so each save gets a fresh index.

### Anchor blinding in saved-responses card
For test-retest reliability, the saved-responses card filters `currentResponses` to current-chunk-only when the stimulus is an anchor. Without this, prior-chunk anchor ratings would leak to the rater and bias their fresh judgment. Don't broaden this filter — the blinding is intentional.

### Schema migration runbook
Before merging any change to [src/lib/config/schema.ts](src/lib/config/schema.ts) that could invalidate stored configs (renaming a field, adding a required field without a default, tightening an enum, etc.), run the three-layer verification:

1. **Layer 1 — local check against prod data**:
   ```
   npm run check-configs
   ```
   Reads every row in `experiments` (via `.env` Supabase creds), applies migration rules from [scripts/migrate-configs-rules.ts](scripts/migrate-configs-rules.ts), re-validates against the current Zod schema. Exit code 0 = clean; exit code 1 = at least one config can't be auto-migrated.

2. **Layer 2 — CI fixture check** (always runs in CI):
   ```
   npm run check-configs:fixtures
   ```
   Same logic against `tests/fixtures/stored-configs.json` — a representative anonymized sample. Catches regressions against KNOWN config shapes without needing prod creds in CI.

3. **Layer 3 — pre-deploy gate** (DEFERRED — see FUTURE_PLANS.md): would require Supabase service-role key in deploy-env secrets.

If `check-configs` exits 1, triage:
- **Option A**: add a migration rule in `scripts/migrate-configs-rules.ts` so the failing shape transforms into the new schema. Test the rule via `migrate-configs.test.ts`. Re-run `check-configs`. If clean, run `npm run migrate-configs:write` to apply.
- **Option B**: write a one-shot SQL UPDATE migration for the affected experiment(s) in `supabase/migrations/`. Document in the migration's commit message which experiment(s) were touched and why.
- **Option C**: reject the schema change. If too many configs would need manual fixes, the schema change is wrong (or premature).

When prod gains a genuinely novel config shape (rare — quarterly), re-dump the fixture so Layer 2 keeps catching regressions: `tsx scripts/dump-fixture-from-prod.ts` (TODO: write this script when needed).

### Admin UI is English-only by design
All admin pages (login, experiment list, settings, config editor, data export, participants, etc.) intentionally use hardcoded English strings rather than going through `i18n.platform()`. Reasons: (a) admins are a tiny audience, (b) translating would also require a pre-login language toggle (the current toggle lives in `Header.svelte`, post-auth), (c) the bilingual surface that matters is the participant-facing experience. If a future admin needs JA, this is a deliberate scope decision to revisit, not an oversight to silently fix in passing. **Do not** wire `i18n.platform()` into admin pages without an explicit ask.

### `unwrap()` / `unwrapVoid()` from `$lib/server/db.ts` is opt-in
These helpers eliminate the `if (error) { console.error; throw }` boilerplate, but only for the canonical "must succeed and must return data" case. Sites that branch on `error.code` (e.g. `23505` unique-violation, `P0004` optimistic-lock conflict, `P0005` last-owner) MUST stay inline so they can map to user-facing messages or 409s. The `auth.admin.listUsers()` site also stays inline — its return type is a discriminated union that doesn't satisfy `unwrap`'s `T | null` contract. Best-effort callers (audit log, rate limiter) deliberately swallow errors and must NOT use `unwrap`.

### `<Toast>` is single-toast-at-a-time by design
The `ToastState` rune class in `$lib/utils/toast.svelte.ts` holds at most one active toast — a later `.show()` call replaces the previous one and resets the 3-second timer. Stacking, fixed positioning, and ARIA live regions are explicitly out of scope; adding any of them is a feature change, not a refactor. The 8 admin pages plus `CollaboratorsPanel` all share this single-toast contract.

### `ConfirmationModal` magic phrase stays in English
The phrase the user must type to confirm a destructive action ("delete experiment", "reset data", "delete user") is intentionally NOT localized. UX rationale: the obscurity is the safety mechanism — typing 削除 is too easy to do accidentally. If a future admin language is added, this phrase stays in English.

### `parseStoredConfig()` defense-in-depth on every config read
Every code path that returns config to downstream consumers (admin or participant) calls `parseStoredConfig()` first. This catches schema drift on JSONB reads — a config that was valid when saved but no longer parses under the current schema fails loudly rather than silently rendering broken UI. Don't try to "optimize" by skipping this.

### Custom video scrubber owns the controls — don't re-add native `controls`
The `<video>` in [VideoPlayer.svelte](src/lib/components/stimuli/VideoPlayer.svelte) intentionally has NO `controls` attribute. Participant-facing playback UI is rendered by [MediaScrubber.svelte](src/lib/components/stimuli/MediaScrubber.svelte): play/pause, custom range slider that calls `media.fastSeek(t)` (Chrome/Safari) or `media.currentTime = t` (Firefox) on every input event, time readout, and a marker overlay. Reasons not to revert: Chrome's native scrubber doesn't seek live during drag (the participant's selected frame doesn't follow the thumb until release — fatal for a moment-picking task), and the seek pipeline coalesces requests so fast scrubs don't queue up decoder work the device can't drain. Audio stimuli still use native `<audio controls>` — no scrubber there, audio has no frame-following requirement.

The scrubber accepts a `markers?: ScrubberMarker[]` prop for visual start/end indicators on the timeline. Phase page + tutorial page derive markers from any active timestamp-range widget value (reusing the `value.split(',')` parse convention). [ReviewItemDisplay](src/lib/components/review/ReviewItemDisplay.svelte) derives them from `parsed.timestamps` so the saved range is visible on the slider during review. Don't introduce a second marker parser — keep the parsing inline at the call site to match TimestampRangeWidget's own convention.

### Tutorial popover for `#stimulus-player` has a runtime overlay workaround
`#stimulus-player` wraps both the (passive) video frame AND the (interactive) scrubber. On narrow viewports Driver.js can't fit the popover beside or below/above the player and falls back to a viewport-centred placement — which lands directly on the scrubber, blocking the participant from operating it. Three layers of mitigation in [TutorialOverlay.svelte](src/lib/components/tutorial/TutorialOverlay.svelte):

1. **Build-time `pickSide` rule** (in [tutorial-placement.ts](src/lib/utils/tutorial-placement.ts)) — converts `bottom` → `top` for `#stimulus-player` targets so we hand Driver.js a placement that doesn't directly conflict with the scrubber.
2. **Runtime overlay** (`maybeOverlayPopoverOnPlayerTop`, runs in `onHighlighted`) — sniffs Driver.js's `driver-popover-arrow-none` class as a "no clean side fits" signal. When detected, pins the popover to the top of the viewport so it overlays only the (passive) video frame, leaving the scrubber clear.
3. **CSS readiness gate** — a scoped `:global(.driver-popover:not([data-tutorial-ready='true'])) { opacity: 0 !important }` rule paired with `animate: false` in the driver config. Without these, Driver.js's CSS animation overrides our inline `opacity:0` and the participant briefly sees the popover at the wrong (initial) position before our reposition runs. `onPopoverRender` strips the readiness attribute (Driver.js reuses the popover element across steps); `onHighlighted` re-applies it after our reposition.

This is load-bearing on three Driver.js implementation details: the `arrow-none` class name, callback timing, and `animate: false`. If Driver.js renames any of these, the runtime overlay silently breaks. The defensive E2E spec at [tests/e2e/participant/tutorial-narrow-viewport.spec.ts](tests/e2e/participant/tutorial-narrow-viewport.spec.ts) catches that — it asserts the popover ends up at `y ≤ 32 px` on a 1024×720 viewport with a player inflated to 60vh-equivalent. Don't disable it.

### Tutorial page-load streams `signedUrls` and `firstChunkUrl`
[+page.server.ts](src/routes/e/[slug]/tutorial/+page.server.ts) returns these as un-awaited promises so the intro modal renders synchronously while signed URL minting + chunk routing settle in the background. On Slow 3G this dropped time-to-modal from ~35 s to ~3 s. The page-svelte resolves the streamed `signedUrls` promise into `$state` via a `$effect`; `handleTutorialComplete` `await`s the streamed `firstChunkUrl` so navigation waits for it if the participant clicks Finish before it resolves. Don't switch back to `await`-on-the-server — that re-introduces the 35 s blank screen.

`signStimuliUrls` accepts an `idFilter` so the tutorial signs only the sample stimulus, not every stimulus in the experiment. Keep this filter on tutorial code paths.

## Credentials

- **`.credentials`**: Contains admin login credentials (email + password) for testing the admin dashboard. Read this file when you need to log in or test admin features. It is gitignored — never hardcode or commit these values.

## Context Guidance

- **`configs/`**: Local-only directory (gitignored) containing exported experiment JSON configs. The schema in `src/lib/config/schema.ts` is the authoritative reference for config structure.

## Documentation

- `SUMMARY.md` — Full project reference (architecture, flow, patterns, structure)
- `docs/SCHEMA.md` — Experiment config schema tree + widget types
- `docs/DATABASE.md` — DB tables, views, RLS policies, migrations
- `docs/SECURITY.md` — Headers, upload validation, rate limiting, CSRF, sessions
- `docs/CHANGELOG.md` — Development phases history
