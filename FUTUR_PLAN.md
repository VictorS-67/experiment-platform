# Future Plan

Detailed roadmap for the Experiment Platform. Organized by priority and effort.

---

## Phase 5: Production Readiness

**Goal**: Get the platform live with real participants.

### 5.1 — Deploy to Vercel
- [x] Create Vercel project, connect Git repository
- [x] Set environment variables (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- [x] Switched to `@sveltejs/adapter-vercel`, production build succeeds
- [x] Verified reads/writes to Supabase work in production
- [ ] Configure custom domain if needed
- [x] Test file uploads (audio recording) work end-to-end in production
- [x] Add Vercel URL to Supabase Auth "Redirect URLs" for admin auth in production

### 5.2 — Migrate Existing Data
- [x] Export data from original Google Sheets experiments (CSVs in `previous_expe_data/`)
- [x] Export audio recordings (in `previous_expe_data/audio/`)
- [x] Create proper `movement-description` JSON config (70 stimuli, widgets: emotion, description, timestamps)
- [x] Write migration script to import participants + responses into Supabase
- [x] Upload audio recordings to Supabase Storage under correct experiment paths
- [x] Add `metadata.originalName` to stimuli items in both configs (from `_Names.csv` mapping files)
- [x] Run migration script (`node scripts/migrate-previous-data.js`) — seed experiments first with `node scripts/seed.js --all`
- [x] Verify migrated data appears correctly in admin data view + CSV export
- [x] Verify migrated participants can log back in (email match)

### 5.3 — Complete Missing Widget Implementations
- [x] **`slider` widget**: `<input type="range">` with min/max/step, endpoint labels, live value display
- [x] **`multiselect` widget**: Toggle buttons, comma-separated storage
- [ ] Test both with save/load round-trip

### 5.4 — Stimulus Ordering Fix
- [x] **`random-per-participant`**: Deterministic seeded shuffle (djb2 hash + mulberry32 PRNG + Fisher-Yates, seed = `participantId + phaseId`)
- [x] Ordering persists across sessions (same seed always produces same permutation)

### 5.5 — End-to-End Testing with Real Users
- [ ] Run a small pilot (5-10 participants) on the deployed platform
- [ ] Collect feedback on UX, loading times, mobile experience
- [ ] Verify CSV export contains all expected data
- [ ] Check audio recordings are accessible in Supabase Storage

---

## Phase 6: Enhanced Admin Features

**Goal**: Make the admin dashboard more powerful for researchers.

### 6.1 — Config Editor Completeness
- [x] **Tutorial editing**: Add form fields for tutorial config (welcome text, steps with targetSelector/validation, completion text, sampleStimuliIds)
- [x] **Per-phase introduction**: Expose `phase.introduction` (title + body) in the form editor
- [x] **Completion config**: Expose `phase.completion` fields (title, body, nextPhaseButton, stayButton) — currently only editable in JSON mode
- [x] **Top-level completion**: Expose `config.completion` (redirectUrl, showSummary)
- [x] **Widget config options**: Expose per-widget-type config in the form editor:
  - textarea: showCharCount, minLength, maxLength
  - likert: min, max, minLabel, maxLabel
  - number: min, max, step
  - slider: min, max, step, minLabel, maxLabel
  - timestamp-range: captureStartLabel, captureEndLabel
  - audio-recording: maxDurationSeconds, maxFileSizeMB
- [x] **Stimuli management**: Add/remove/reorder stimulus items in the form editor (currently items array must be edited in JSON mode)
- [x] **Field validation config**: Expose `validation` options (min, max, pattern) for registration fields in form editor

### 6.2 — Experiment Duplication
- [x] "Duplicate" button on experiment list and edit pages
- [x] Creates a copy with a new slug (e.g., `my-experiment-copy`), status `draft`
- [x] Deep clones the config JSONB
- [x] Does NOT copy participants or responses

### 6.3 — Participant Management
- [x] View individual participant detail page (all responses, registration data, timestamps)
- [x] Delete individual participant and cascade-delete their responses
- [x] "Reset" participant (delete responses but keep registration — lets them redo the experiment)
- [x] Bulk operations: select multiple participants, delete/export
- [x] Stats panel on data page: total participants, per-phase started counts, stimulus response distribution

### 6.4 — Data Export Improvements
- [x] **Per-phase export**: Filter CSV by phase_id
- [x] **JSON export**: Alternative to CSV for nested response_data
- [x] **Timestamp formatting**: Option to export timestamps as human-readable dates vs ISO strings
- [x] **Include registration data columns**: Flatten `registration_data` JSONB into separate CSV columns
- [ ] **Audio file download**: Bulk download all audio recordings for an experiment as a ZIP (deferred — Supabase Storage dashboard covers this at current scale)
- [x] **Export configuration**: Let researchers choose which columns to include (via export options panel)

### 6.5 — Real-Time Participant Monitoring
- [x] ~~Dropped as standalone feature~~: Completion rates and stimulus dropout stats added to data page as a static stats panel (loaded at page load). At 1-2 participants/day, real-time polling adds complexity with negligible value.

### 6.6 — Experiment Versioning
- [x] Track config changes over time (store previous versions) — `experiment_config_versions` table + migration 007
- [ ] Show diff between versions (deferred)
- [x] Ability to rollback to a previous config version
- [x] Warn when editing a config that has active participants (changing stimuli/widgets mid-experiment can invalidate data)

---

## Phase 7: Quality & Polish

**Goal**: Improve reliability, accessibility, and user experience.

### 7.1 — Test Suite
- [ ] Set up Vitest for unit tests
- [ ] **Unit tests**:
  - [ ] Zod schema validation (valid configs pass, invalid configs fail with correct errors)
  - [ ] i18n store: `platform()` key lookup + interpolation, `localized()` fallback logic
  - [ ] Response store: `completedStimuli` and `byStimulus` computed maps
  - [ ] `obtainDate()` utility
- [ ] Set up Playwright for E2E tests
- [ ] **E2E tests**:
  - [ ] Participant registration flow (new + returning)
  - [ ] Stimulus-response save round-trip
  - [ ] Phase completion → next phase navigation
  - [ ] Review phase: source responses displayed, replay button works
  - [ ] Admin login → create experiment → edit config → save
  - [ ] CSV export contains correct data
- [ ] Add test commands to `package.json`
- [ ] Consider CI pipeline (GitHub Actions)

### 7.2 — UI Polish
- [ ] **Mobile responsiveness**: Test and fix layout on small screens (stimulus nav wrapping, widget sizing, admin sidebar)
- [ ] **Loading states**: Add skeleton screens or spinners for:
  - Initial experiment config load
  - Response save in progress (disable all widgets, not just the save button)
  - Admin experiment list loading
  - CSV export download
- [ ] **Error boundaries**: Add SvelteKit `+error.svelte` pages for:
  - Experiment not found (invalid slug)
  - Experiment not active (draft/paused/archived)
  - Session expired (redirect to registration with message)
  - Server errors (500)
- [ ] **Toast notifications**: Replace the current simple `message` state with a proper toast system (auto-dismiss, stackable, different types)
- [ ] **Keyboard navigation**: Ensure all interactive elements are keyboard-accessible (tab order, Enter/Space activation, Escape to close modals)

### 7.3 — Accessibility
- [ ] Fix a11y warnings in ConfigEditor (labels not associated with controls)
- [ ] Add ARIA labels to stimulus navigation buttons
- [ ] Ensure color contrast meets WCAG AA for all status badges and buttons
- [ ] Add `aria-live` regions for dynamic content updates (save success/error messages)
- [ ] Screen reader testing for the full participant flow

---

## Phase 8: Advanced Experiment Features

**Goal**: Support more complex experimental designs.

### 8.1 — More Widget Types
- [ ] **Image annotation**: Click/draw on an image to mark regions
- [ ] **Ranking/sorting**: Drag-and-drop to rank a set of options
- [ ] **Matrix/grid**: Table with rows (items) and columns (scale points)
- [ ] **Comparison**: Side-by-side stimulus comparison with preference selection
- [ ] **Free drawing**: Canvas-based drawing widget (for gesture/movement sketching)

### 8.2 — More Stimulus Types
- [ ] **Image stimuli**: Full support in StimulusRenderer (currently dispatches to `<img>` but untested end-to-end)
- [ ] **Audio stimuli**: Dedicated audio player component
- [ ] **Text stimuli**: Rich text / markdown rendering
- [ ] **Multi-stimulus**: Show multiple stimuli simultaneously (e.g., A/B comparison)
- [ ] **Embedded stimuli**: iframes for external content (with CSP considerations)

### 8.3 — Conditional Logic Within Phases
- [ ] Show/hide widgets based on other widget values (like registration conditional fields, but for response widgets)
- [ ] Skip stimuli based on previous responses
- [ ] Branching phases (go to phase A or B based on a response)

### 8.4 — Stimulus Groups / Blocks
- [ ] Group stimuli into blocks with block-level instructions
- [ ] Randomize within blocks but keep block order fixed
- [ ] Break screens between blocks
- [ ] Block-level completion tracking

### 8.5 — Participant Quotas and Assignment
- [ ] Set max participants per experiment
- [ ] Assign participants to conditions (between-subjects design)
- [ ] Counterbalanced stimulus assignment across participants
- [ ] Quota tracking: close registration when target N reached per condition

---

## Phase 9: Analytics & Insights

**Goal**: Help researchers analyze data without leaving the platform.

### 9.1 — In-App Analytics Dashboard
- [ ] Response distribution charts per widget (histograms, bar charts)
- [ ] Completion funnel: registration → tutorial → phase 1 → phase 2 → ...
- [ ] Average time per stimulus
- [ ] Response rate heatmap across stimuli

### 9.2 — Inter-Rater Reliability
- [ ] Compute agreement metrics (Cohen's kappa, Krippendorff's alpha) for review phases
- [ ] Show per-stimulus agreement scores
- [ ] Flag stimuli with low agreement for researcher attention

### 9.3 — Multi-Experiment Aggregation
- [ ] Compare response distributions across experiments
- [ ] Merge CSV exports from multiple experiments
- [ ] Cross-experiment participant tracking (if same email used)

---

## Phase 10: Platform Scaling

**Goal**: Support larger studies and multiple research teams.

### 10.1 — Multi-Tenant / Team Support
- [ ] Multiple admin users per experiment (currently only one admin role exists)
- [ ] Role-based permissions: `admin` (full access) vs `researcher` (view data, no config edit) vs `viewer` (read-only)
- [ ] Experiment ownership and sharing between team members

### 10.2 — Performance Optimization
- [ ] Pagination for experiment list, participant list, and response data
- [ ] Lazy-load stimulus items (currently all items loaded at once)
- [ ] Streaming CSV export for large datasets (instead of loading all into memory)
- [ ] CDN caching for static stimulus files
- [ ] Database indexes optimization based on query patterns

### 10.3 — Internationalization Expansion
- [ ] Add more platform languages beyond EN/JA (framework already supports it — just add JSON files)
- [ ] RTL language support (Arabic, Hebrew)
- [ ] Allow experiments to define their own set of supported languages (currently hardcoded to `metadata.languages`)

### 10.4 — API / Integration
- [ ] Webhook notifications (participant registered, phase completed, experiment completed)
- [ ] REST API for programmatic experiment management
- [ ] Integration with Prolific / MTurk for participant recruitment (completion URLs, ID tracking)
- [ ] GDPR data export / deletion endpoints

---

## Technical Debt

Items that should be addressed along the way, not necessarily as dedicated phases:

- [x] ~~**Remove legacy endpoints**~~: Deleted `src/routes/e/[slug]/survey/{save,upload}`
- [x] ~~**Environment variable validation**~~: Added fail-fast validation in `src/lib/server/supabase.ts`
- [x] ~~**Rate limiting**~~: In-memory sliding window on `/auth`, `/save`, `/upload` endpoints in `hooks.server.ts`. ⚠️ Note: module-scope state resets on serverless cold starts — effective only on long-running Node processes. Replace with Redis/Upstash for production Vercel deployment.
- [x] ~~**CSRF protection**~~: Origin header checking on all API POST endpoints
- [x] ~~**Fix `response_flat` SECURITY DEFINER**~~: Migration 006 — `security_invoker = true`
- [x] ~~**Remove redundant `_timestamp` from response_data**~~: Client was recording `_timestamp` alongside server-side `created_at`. Removed — `created_at` is the authoritative timestamp.
- [x] ~~**Deduplicate `COOKIE_OPTIONS`**~~: Was defined identically in 3 files. Extracted to `src/lib/server/cookies.ts`.
- [x] ~~**Remove dead code `getAdminUser()`**~~: Was exported but never called (admin auth fully handled in `hooks.server.ts`).
- [x] ~~**DB error messages leaking to clients**~~: All `throw new Error(\`...: ${error.message}\`)` replaced with generic messages + `console.error()` for server-side logging.
- [x] ~~**`.single()` on admin_users throws on no-row**~~: Fixed to `.maybeSingle()` in `hooks.server.ts` — prevents 500 errors for valid Supabase users not in the admin table.
- [ ] **Serverless rate limiting**: The current in-memory rate limiter is ineffective on Vercel (resets per cold start). Replace with Redis/Upstash-backed solution before high-traffic launch.
- [ ] **Full RLS enforcement**: Current RLS relies on app-layer filtering for most reads (service role bypasses RLS). Consider adding DB-layer policies on `participants`/`responses` for defense in depth.
- [ ] **WidgetRenderer split**: `WidgetRenderer.svelte` handles 8+ widget types in one file. Consider splitting into per-type components when adding new widget types (Phase 8+).
- [ ] **DB-side aggregates**: `getParticipants()` and `getExperimentStats()` fetch all rows and aggregate in JS. Fine at current scale; add a DB `count()` query or view when participant/response counts grow.
- [ ] **Clean up `HANDOFF.md`**: Outdated from Phase 2, now superseded by `SUMMARY.md`
- [ ] **Supabase types**: Consider generating TypeScript types from the database schema (`supabase gen types`)
- [ ] **Error logging**: Add structured logging (currently just `console.error`) — consider Sentry or similar
- [ ] **Session token rotation**: Currently session tokens never change — consider rotating on each login for better security
- [ ] **Database backups**: Set up automated Supabase backups before going live with real data
