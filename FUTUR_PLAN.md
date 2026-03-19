# Future Plan

Detailed roadmap for the Experiment Platform. Organized by priority and effort.

---

## Phase 5: Production Readiness

**Goal**: Get the platform live with real participants.

### 5.1 — Deploy to Vercel
- [ ] Create Vercel project, connect Git repository
- [ ] Set environment variables (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Test production build (`npm run build` + `npm run preview` locally first)
- [ ] Configure custom domain if needed
- [ ] Verify CSP headers work in production (Supabase URLs must match)
- [ ] Test file uploads (audio recording) work end-to-end in production

### 5.2 — Migrate Existing Data
- [ ] Export data from original Google Sheets experiment (`movement-to-onomatopoeia`)
- [ ] Write migration script to import participants + responses into Supabase
- [ ] Map old response format to new `response_data` JSONB structure
- [ ] Verify migrated data appears correctly in admin data view + CSV export
- [ ] Verify migrated participants can log back in (email match)

### 5.3 — Complete Missing Widget Implementations
- [ ] **`slider` widget**: Add rendering in `WidgetRenderer.svelte` — HTML `<input type="range">` with min/max/step, optional endpoint labels, live value display
- [ ] **`multiselect` widget**: Add rendering — checkboxes or multi-select dropdown, store as comma-separated or JSON array string
- [ ] Test both with save/load round-trip

### 5.4 — Stimulus Ordering Fix
- [ ] **`random-per-participant`**: Currently `random` re-shuffles on every page load. Implement deterministic per-participant ordering:
  - Option A: Seed a PRNG with `hash(participant_id + phase_id)` for consistent shuffle
  - Option B: Store the shuffled order in `registration_data` or a new `participant_phases` table on first visit
- [ ] Ensure ordering persists across sessions (participant closes browser and returns)

### 5.5 — End-to-End Testing with Real Users
- [ ] Run a small pilot (5-10 participants) on the deployed platform
- [ ] Collect feedback on UX, loading times, mobile experience
- [ ] Verify CSV export contains all expected data
- [ ] Check audio recordings are accessible in Supabase Storage

---

## Phase 6: Quality & Polish

**Goal**: Improve reliability, accessibility, and user experience.

### 6.1 — Test Suite
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

### 6.2 — UI Polish
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

### 6.3 — Config Editor Completeness
- [ ] **Tutorial editing**: Add form fields for tutorial config (welcome text, steps with targetSelector/validation, completion text, sampleStimuliIds)
- [ ] **Per-phase introduction**: Expose `phase.introduction` (title + body) in the form editor
- [ ] **Completion config**: Expose `phase.completion` fields (title, body, nextPhaseButton, stayButton) — currently only editable in JSON mode
- [ ] **Top-level completion**: Expose `config.completion` (redirectUrl, showSummary)
- [ ] **Widget config options**: Expose per-widget-type config in the form editor:
  - textarea: showCharCount, minLength, maxLength
  - likert: min, max, minLabel, maxLabel
  - number: min, max, step
  - slider: min, max, step, minLabel, maxLabel
  - timestamp-range: captureStartLabel, captureEndLabel
  - audio-recording: maxDurationSeconds, maxFileSizeMB
- [ ] **Stimuli management**: Add/remove/reorder stimulus items in the form editor (currently items array must be edited in JSON mode)
- [ ] **Field validation config**: Expose `validation` options (min, max, pattern) for registration fields in form editor

### 6.4 — Accessibility
- [ ] Fix a11y warnings in ConfigEditor (labels not associated with controls)
- [ ] Add ARIA labels to stimulus navigation buttons
- [ ] Ensure color contrast meets WCAG AA for all status badges and buttons
- [ ] Add `aria-live` regions for dynamic content updates (save success/error messages)
- [ ] Screen reader testing for the full participant flow

---

## Phase 7: Enhanced Admin Features

**Goal**: Make the admin dashboard more powerful for researchers.

### 7.1 — Experiment Duplication
- [ ] "Duplicate" button on experiment list and edit pages
- [ ] Creates a copy with a new slug (e.g., `my-experiment-copy`), status `draft`
- [ ] Deep clones the config JSONB
- [ ] Does NOT copy participants or responses

### 7.2 — Participant Management
- [ ] View individual participant detail page (all responses, registration data, timestamps)
- [ ] Delete individual participant and cascade-delete their responses
- [ ] "Reset" participant (delete responses but keep registration — lets them redo the experiment)
- [ ] Bulk operations: select multiple participants, delete/export

### 7.3 — Data Export Improvements
- [ ] **Per-phase export**: Filter CSV by phase_id
- [ ] **JSON export**: Alternative to CSV for nested response_data
- [ ] **Timestamp formatting**: Option to export timestamps as human-readable dates vs ISO strings
- [ ] **Include registration data columns**: Flatten `registration_data` JSONB into separate CSV columns
- [ ] **Audio file download**: Bulk download all audio recordings for an experiment as a ZIP
- [ ] **Export configuration**: Let researchers choose which columns to include

### 7.4 — Real-Time Participant Monitoring
- [ ] Dashboard showing live participant count, completion rates per phase
- [ ] Use Supabase Realtime subscriptions or periodic polling
- [ ] Show which stimuli have the most/fewest responses
- [ ] Alert when a participant has been inactive for a configurable duration

### 7.5 — Experiment Versioning
- [ ] Track config changes over time (store previous versions)
- [ ] Show diff between versions
- [ ] Ability to rollback to a previous config version
- [ ] Warn when editing a config that has active participants (changing stimuli/widgets mid-experiment can invalidate data)

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

- [ ] **Remove legacy endpoints**: `src/routes/e/[slug]/survey/{save,upload}` are duplicates of the phase-specific endpoints
- [ ] **Supabase types**: Consider generating TypeScript types from the database schema (`supabase gen types`)
- [ ] **Environment variable validation**: Add Zod validation for env vars at startup (fail fast if misconfigured)
- [ ] **Error logging**: Add structured logging (currently just `console.error`) — consider Sentry or similar
- [ ] **Rate limiting**: Add rate limits to auth and save endpoints to prevent abuse
- [ ] **CSRF protection**: SvelteKit form actions have built-in CSRF, but API endpoints (`+server.ts`) do not — add origin checking
- [ ] **Session token rotation**: Currently session tokens never change — consider rotating on each login for better security
- [ ] **Database backups**: Set up automated Supabase backups before going live with real data
