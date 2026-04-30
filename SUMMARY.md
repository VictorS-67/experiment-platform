# Experiment Platform — Comprehensive Project Summary

> **Purpose**: This document is written for AI agents. It contains everything needed to understand, navigate, and continue development on this project without prior context.
>
> **Last updated**: 2026-04-30
> **Build status**: 0 type errors, production build succeeds. 150 Vitest unit tests passing; 83 Playwright E2E tests passing (against local Supabase).
> **Deployed**: Vercel (using `@sveltejs/adapter-vercel`)

---

## 1. What This Project Is

A **config-driven experiment/survey platform** for academic research data collection. One SvelteKit deployment serves unlimited experiments — each experiment is defined entirely by a JSON config (validated by Zod, stored as JSONB in Supabase Postgres) and accessed at `/e/{slug}/`. No code changes or redeployment are needed per experiment.

**Origin**: Generalizes a vanilla JS research app (`/Users/victor/projects/movement-to-onomatopoeia/`) that collected onomatopoeia responses to 144 point-light motion capture videos, using Google Sheets + Google Drive. This platform replaces that with a proper database-backed, multi-experiment system.

**First experiment**: `movement-onomatopoeia` — participants watch point-light motion videos, write onomatopoeia, mark timestamps, and optionally record audio. Bilingual EN/JA. 144 stimuli, 3 response widgets, gatekeeper question, tutorial.

**Two user roles**:
- **Participants**: Register via email, complete multi-phase experiments (stimulus-response + review phases), record audio, annotate timestamps
- **Admins**: CRUD experiments, edit configs via Form or JSON editor, view participant data, export CSV. Authorization is **per-experiment** via `experiment_collaborators` rows (owner / editor / viewer); admins are NOT granted access to all experiments by default.

---

## 2. Tech Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Framework | SvelteKit | v2.50+, `@sveltejs/adapter-vercel` |
| UI | Svelte 5 | Runes API: `$state`, `$derived`, `$effect`, `$props`, `$bindable` |
| Language | TypeScript | Strict mode, bundler moduleResolution |
| Styling | Tailwind CSS | v4, via `@tailwindcss/vite` plugin |
| Database | Supabase (Postgres) | Hosted at `glmfyoqkuwhtgzcisvbe.supabase.co` |
| Storage | Supabase Storage | Bucket: `experiments` (public) |
| Validation | Zod | v4, config schema validation |
| Tutorial | Driver.js | v1.4, step-by-step overlay system |
| Package manager | npm | ESM (`"type": "module"` in package.json) |
| Deployment | Vercel (planned) | Not yet deployed |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     SvelteKit App                        │
│                                                          │
│  Participant routes (/e/[slug]/...)                       │
│    ├── Registration (email → form → redirect)            │
│    ├── Tutorial (Driver.js overlay)                      │
│    ├── Phase pages (stimulus-response / review)          │
│    └── API endpoints (auth, save, upload)                │
│                                                          │
│  Admin routes (/admin/...)                               │
│    ├── Login (Supabase Auth)                             │
│    ├── Experiment list/create                            │
│    ├── Experiment edit (Settings + Config tabs)          │
│    └── Data view + CSV export                            │
│                                                          │
│  Shared                                                  │
│    ├── Stores (Svelte 5 rune-based singletons)           │
│    ├── Config schema (Zod validation)                    │
│    ├── i18n (platform translations: en, ja)              │
│    ├── Components (widgets, stimuli, layout, admin)      │
│    └── Server-only data layer (Supabase service role)    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    Supabase                               │
│  ├── PostgreSQL (experiments, participants, responses,    │
│  │   file_uploads, admin_users, response_flat view)      │
│  ├── Auth (admin login only — participants use custom     │
│  │   session_token system)                               │
│  ├── Storage (video files, audio recordings)             │
│  └── RLS policies (tightened: anon can only read active   │
│      experiments; all other reads via service role)       │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **All Supabase mutations are server-side only** — the browser never calls Supabase directly for writes. The anon key is used only in the experiment layout server load (`src/routes/e/[slug]/+layout.server.ts`) to read active experiment configs. Everything else uses the service role key in `src/lib/server/`.

2. **Participant auth is custom** — not Supabase Auth. Participants get a `session_token` (UUID, DB-generated) stored as an httpOnly cookie (90-day maxAge). The server validates this token on every protected page load via `getParticipantByToken()`.

3. **Admin auth uses Supabase Auth** — email/password login, with `admin_access_token`/`admin_refresh_token` httpOnly cookies. The `hooks.server.ts` middleware verifies the JWT via `getUser()`, refreshes if expired, AND checks the `admin_users` table to confirm authorization.

4. **Config-driven** — the entire experiment structure (registration fields, phases, stimuli, widgets, tutorials, completion modals) is defined in a single JSON object validated by Zod. The admin edits this config; the participant-facing app renders it.

5. **Svelte 5 runes** — stores use `$state` class fields in `.svelte.ts` files, components use `$props()`, `$derived`, `$effect`, `$bindable`. No legacy Svelte 4 stores.

6. **Two Supabase clients**:
   - **Anon key** (`src/lib/services/supabase.ts`): Used for experiment config reads and admin JWT verification only
   - **Service role** (`src/lib/server/supabase.ts`): Singleton, bypasses all RLS, used for all participant/response/admin CRUD

---

## 4. Environment Variables

File: `.env` (not committed; template at `.env.example`)

```
PUBLIC_SUPABASE_URL=https://glmfyoqkuwhtgzcisvbe.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

- `PUBLIC_*` vars are available both client-side and server-side
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (never exposed to browser), bypasses all RLS

---

## 5. Database Schema

See [docs/DATABASE.md](docs/DATABASE.md) for full schema, all 21 migrations, RPCs, triggers, and FK cascade rules. Highlights:

```sql
experiments                (id, slug UNIQUE, status, config JSONB, created_by, created_at, updated_at)
participants               (id, experiment_id FK, email, registration_data, session_token UNIQUE NOT NULL,
                            chunk_assignments JSONB, last_active_at, last_rotated_at, registered_at)
responses                  (id, experiment_id FK, participant_id FK, phase_id, stimulus_id, response_data, response_index)
file_uploads               (id, response_id FK, experiment_id FK, participant_id FK, widget_id, storage_path, file_type, file_size)
admin_users                (user_id PK FK auth.users, role)
experiment_config_versions (id, experiment_id FK, version_number, config, created_at)
experiment_collaborators   (id, experiment_id FK, user_id FK auth.users, role CHECK(owner|editor|viewer))   -- per-experiment authz
pending_invites            (id, experiment_id FK, email, role, claim_token UNIQUE, claimed_at, claimed_by)   -- email invite flow
rate_limits                (key, endpoint, window_start, count) PK(key, endpoint, window_start)             -- Postgres-backed limiter
admin_audit_log            (id, admin_user_id, admin_email, experiment_id FK ON DELETE SET NULL, action,    -- append-only
                            resource_type, resource_id, ip, metadata, created_at)
error_log                  (id, level, message, stack, context, created_at)
```

**Triggers**:
- `enforce_owner_invariant` on `experiment_collaborators` — blocks removing/demoting the last owner; short-circuits during cascade-delete (migration 021).
- `auto_add_creator_as_owner` on `experiments` — auto-inserts an `experiment_collaborators(role='owner')` row for `created_by`.

**RPCs**:
- `set_chunk_assignment(p_id, chunk_key, assignment)` — atomic JSONB update.
- `insert_config_version(exp_id, cfg)` — atomic version-row insert.
- `upsert_config_with_version(exp_id, cfg, expected_updated_at)` — atomic save + version + optimistic lock (raises `P0004` on conflict).
- `rate_limit_check(key, endpoint, max, window_seconds)` — sliding-window counter.

### Security Model Summary

- **Anon key can**: SELECT from `experiments` (active configs only), INSERT into `participants`/`responses`/`file_uploads` (with reference checks).
- **Anon key cannot**: SELECT from sensitive tables, UPDATE anything, DELETE anything.
- **Service role key**: Full unrestricted access (server-side only).
- **Per-experiment authorization** is enforced at the application layer via `requireExperimentAccess()` from `$lib/server/collaborators` — RLS does NOT enforce collaborator roles because admin code paths run as service role. Non-collaborators get **404** (hide existence), not 403.

---

## 6. Experiment Config Schema

The config is the central data structure. Full Zod schema: `src/lib/config/schema.ts`.

```
ExperimentConfig
├── slug: string (lowercase alphanumeric + hyphens, regex validated)
├── version: int (default 1)
├── status: "draft" | "active" | "paused" | "archived"
├── metadata
│   ├── title: LocalizedString          # Record<string, string> e.g. { "en": "...", "ja": "..." }
│   ├── description: LocalizedString?
│   ├── languages: string[]             # default ["en"]
│   └── defaultLanguage: string         # default "en"
├── registration
│   ├── introduction
│   │   ├── title, body: LocalizedString
│   │   ├── instructions: LocalizedStringArray?    # Record<string, string[]>
│   │   └── additionalInfo: LocalizedString?
│   └── fields: RegistrationField[]
│       ├── id, type (text|number|email|select|multiselect|textarea)
│       ├── label: LocalizedString, placeholder: LocalizedString?
│       ├── required: boolean, defaultValue: string?
│       ├── validation: { min?, max?, pattern?, errorMessage? }?
│       ├── options: [{ value, label, showConditionalField? }]?
│       └── conditionalOn: { field, value }?    # Show only if another field has specific value
├── tutorial: TutorialConfig | null
│   ├── allowSkip: boolean?
│   ├── introduction?: { title, body, buttonText? }    # Optional intro page before tutorial
│   ├── welcome: { title, body, buttonText }
│   ├── steps: TutorialStep[]
│   │   ├── id, targetSelector (CSS selector), title, body: LocalizedString
│   │   ├── instruction: LocalizedString?, position: top|bottom|left|right|center
│   │   ├── validation: { type: click|input|play|none, target?: string }?
│   │   └── autoAdvance: boolean?    # Auto-advances overlay ~400ms after validation action completes
│   ├── completion: { title, body, buttonText }
│   └── sampleStimuliIds: string[]
├── phases: PhaseConfig[] (min 1)
│   ├── id, slug, type: "stimulus-response" | "review"
│   ├── title: LocalizedString
│   ├── introduction: { title, body }?
│   ├── gatekeeperQuestion?
│   │   ├── initial: { text, yesLabel, noLabel: LocalizedString }   # first encounter (no prior response)
│   │   ├── subsequent?: { text, yesLabel, noLabel: LocalizedString } # re-prompt after a real response
│   │   └── skipToNext: boolean (default true)
│   ├── responseWidgets: ResponseWidget[]       # For stimulus-response phases
│   ├── reviewConfig?                           # For review phases
│   │   ├── sourcePhase: string                 # References another phase's id
│   │   ├── filterEmpty: boolean (default true)
│   │   ├── replayMode: "segment" | "full-highlight" (default "segment")
│   │   ├── allowNavigation: boolean (default false)   # false = sequential only, StimulusNav hidden
│   │   └── responseWidgets: ResponseWidget[]   # Widgets specific to the review phase
│   ├── stimulusOrder: "sequential" | "random" | "random-per-participant"
│   ├── allowRevisit: boolean (default true)
│   ├── allowMultipleResponses: boolean (default false)
│   ├── skipRules: SkipRule[]?              # Skip stimuli based on prior response values
│   │   ├── targetStimulusId: string
│   │   └── condition: { stimulusId, widgetId, operator: "equals"|"not_equals", value }
│   ├── branchRules: BranchRule[]?          # Navigate to non-sequential next phase on completion
│   │   ├── condition: { widgetId, stimulusId?, operator: "equals"|"not_equals", value }
│   │   └── nextPhaseSlug: string
│   └── completion: PhaseCompletion
│       ├── title, body: LocalizedString
│       ├── nextPhaseButton: LocalizedString?   # If absent, falls back to i18n key
│       └── stayButton: LocalizedString?        # If absent, falls back to i18n key
├── stimuli
│   ├── type: "video" | "image" | "audio" | "text" | "mixed"
│   ├── source: "upload" | "external-urls" | "supabase-storage" (default)
│   ├── storagePath: string?
│   ├── items: StimulusItem[]
│   │   ├── id, type?, url?, filename?
│   │   ├── label: LocalizedString?
│   │   └── metadata: Record<string, any>?
│   └── chunking?: ChunkingConfig
│       ├── enabled: boolean (default false)
│       ├── blockOrder: "sequential" | "latin-square" | "random-per-participant"
│       ├── withinBlockOrder: "sequential" | "random" | "random-per-participant"
│       ├── breakScreen?: BreakScreen       # Shown between blocks
│       │   ├── title, body: LocalizedString
│       │   └── duration?: number           # Seconds before "Continue" button activates
│       └── chunks: ChunkConfig[]
│           ├── id, slug (regex validated), label?: LocalizedString
│           └── blocks: BlockConfig[]
│               ├── id, label?: LocalizedString
│               └── stimulusIds: string[]
└── completion?
    ├── title, body: LocalizedString
    ├── redirectUrl: string?
    └── showSummary: boolean?
```

### Response Widget Types

| Type | UI Component | Config Options | Storage in `response_data` |
|------|-------------|----------------|---------------------------|
| `text` | `<input type="text">` | — | `{widgetId}: "value"` |
| `textarea` | `<textarea>` | `showCharCount`, `minLength`, `maxLength` | `{widgetId}: "value"` |
| `select` | `<select>` dropdown | `options: [{ value, label }]` | `{widgetId}: "selectedValue"` |
| `multiselect` | Toggle buttons, comma-separated | `options: [{ value, label }]` | `{widgetId}: "a,b,c"` |
| `number` | `<input type="number">` | `min`, `max`, `step` | `{widgetId}: "value"` |
| `likert` | Row of clickable number buttons | `min`, `max`, `minLabel`, `maxLabel` | `{widgetId}: "3"` |
| `slider` | `<input type="range">` with labels | `min`, `max`, `step`, `minLabel`, `maxLabel` | `{widgetId}: "value"` |
| `timestamp-range` | Two buttons capturing `mediaElement.currentTime` | `captureStartLabel`, `captureEndLabel`, `timestampReviewMode` | `{widgetId}_start: "1.23"`, `{widgetId}_end: "4.56"` |
| `audio-recording` | MediaRecorder with record/stop/playback/delete | `maxDurationSeconds`, `maxFileSizeMB` | `{widgetId}: "storage/path.webm"` |

All `ResponseWidget` types share common optional fields:
- `conditionalOn: { widgetId, value }?` — show this widget only when another widget in the same phase has the given value; hidden widgets are excluded from required-field validation and saved as `null`
- `stepNumber: number?`, `stepLabel: LocalizedString?` — for multi-step visual grouping
- `placeholder: LocalizedString?` — hint text for text/textarea/number widgets

**Timestamp-range storage detail**: The widget internally uses a comma-separated string `"start,end"` that gets split on save into two separate keys: `{widgetId}_start` and `{widgetId}_end`. On review, `ReviewItemDisplay` detects these pairs and shows a replay button. The `timestampReviewMode` config (`segment` or `full-highlight`) adds a Review button during data collection that replays the captured segment using the shared replay controller (`src/lib/utils/replay.ts`).

### Stimulus Naming Convention

**For existing experiments** (`movement-onomatopoeia`, `movement-description`): Stimuli use numeric IDs (`"4"`) and filenames (`"4.mp4"`) because the original video names revealed information about the content (e.g., `JP_01_anger_1_M`). The mapping from numbered name → original name is stored in `previous_expe_data/{experiment}/_{experiment}_Names.csv`. The numeric IDs are permanent for these experiments because all response data references them as `stimulus_id`.

**For all future experiments**: Use the original filename as both `id` and `filename` (e.g., `{ "id": "throwing_ball", "filename": "throwing_ball.mp4" }`). No renaming needed.

**Storage layout**: Each experiment's videos are in a separate Supabase Storage folder: `stimuli/{experiment-slug}/`. So `stimuli/movement-onomatopoeia/4.mp4` and `stimuli/movement-description/4.mp4` are different files.

---

## 7. Directory Structure

```
experiment-platform/
├── .env.example                          # Template for environment variables
├── package.json                          # npm deps, scripts
├── svelte.config.js                      # adapter-vercel, no custom aliases
├── tsconfig.json                         # Strict, extends .svelte-kit/tsconfig
├── vite.config.ts                        # Plugins: tailwindcss() + sveltekit()
├── HANDOFF.md                            # Original handoff doc (from Phase 2)
├── SUMMARY.md                            # This file
├── configs/                              # Local experiment JSON configs (gitignored)
├── scripts/
│   ├── seed.js                           # Upsert config JSON into experiments table
│   ├── sync-remote-to-local.js           # Copy all remote Supabase data → local instance (run after `supabase start`)
│   ├── upload-test-videos.js             # Upload first 3 videos to Supabase Storage
│   └── upload-all-videos.js              # Upload all 144 videos with progress bar
├── supabase/migrations/                  # 8 SQL migration files (see section 5)
├── src/
│   ├── app.css                           # Tailwind import + custom styles (buttons, spinner, modal, message)
│   ├── app.d.ts                          # App.Locals: { sessionToken: string|null, adminUser: {id,email,role}|null }
│   ├── app.html                          # HTML shell
│   ├── hooks.server.ts                   # Session parsing, admin auth middleware, security headers
│   ├── lib/
│   │   ├── index.ts                      # Empty placeholder for $lib alias
│   │   ├── config/
│   │   │   ├── schema.ts                 # Full Zod schema + all type exports (incl. ChunkingConfig, BlockConfig)
│   │   │   └── schema.test.ts            # 46 unit tests for schema validation (incl. conditionalOn, skipRules, branchRules, breakScreen)
│   │   ├── i18n/
│   │   │   ├── index.svelte.ts           # I18nStore class: platform() + localized()
│   │   │   └── platform/
│   │   │       ├── en.json               # English translations (93 lines)
│   │   │       └── ja.json               # Japanese translations (91 lines)
│   │   ├── server/
│   │   │   ├── supabase.ts              # Service role client singleton (getServerSupabase())
│   │   │   ├── cookies.ts               # Shared COOKIE_OPTIONS (httpOnly, sameSite lax, secure)
│   │   │   ├── data.ts                  # Participant/response CRUD + file upload + chunk assignments
│   │   │   └── admin.ts                 # Admin CRUD + data export + versioning (313 lines)
│   │   ├── services/
│   │   │   ├── supabase.ts              # Anon client (browser-safe, used minimally)
│   │   │   └── data.ts                  # Shared interfaces: ParticipantRecord, ResponseRecord
│   │   ├── stores/
│   │   │   ├── experiment.svelte.ts     # ExperimentStore: config, id + getters
│   │   │   ├── participant.svelte.ts    # ParticipantStore: current user, isAuthenticated
│   │   │   └── responses.svelte.ts      # ResponseStore: list, currentIndex, completedStimuli, byStimulus
│   │   ├── utils/
│   │   │   ├── index.ts                 # obtainDate(), seededShuffle(), latinSquareOrder()
│   │   │   ├── index.test.ts            # 15 tests for seededShuffle + latinSquareOrder
│   │   │   ├── replay.ts               # Shared replay controller (replaySegment, replayFullWithHighlight, cleanup)
│   │   │   └── replay.test.ts           # 12 tests for replay controller
│   │   └── components/
│   │       ├── admin/
│   │       │   ├── ConfigEditor.svelte       # Full form editor for experiment config (~1695 lines)
│   │       │   ├── FormSection.svelte        # Collapsible section with open/close toggle
│   │       │   └── LocalizedInput.svelte     # Multi-language text/textarea input
│   │       ├── layout/
│   │       │   ├── Header.svelte             # Language selector + participant name + logout
│   │       │   ├── Modal.svelte              # Generic modal (backdrop click + Escape key close)
│   │       │   ├── ProgressBar.svelte        # Animated progress bar (current/total + percentage)
│   │       │   └── StimulusNav.svelte        # Numbered buttons with completion state colors
│   │       ├── registration/
│   │       │   ├── FieldRenderer.svelte      # Renders one field by type
│   │       │   └── RegistrationForm.svelte   # Dynamic form with conditional field visibility
│   │       ├── review/
│   │       │   └── ReviewItemDisplay.svelte  # Source response display + timestamp pair detection + audio path detection + replay button
│   │       ├── stimuli/
│   │       │   ├── StimulusRenderer.svelte   # Dispatches to VideoPlayer/img/audio/text by type
│   │       │   └── VideoPlayer.svelte        # Constructs Supabase Storage URL, renders <video>; exports getStimulusVideoUrl() for use by the phase page
│   │       ├── tutorial/
│   │       │   └── TutorialOverlay.svelte    # Driver.js integration with step validation
│   │       └── widgets/
│   │           ├── WidgetRenderer.svelte      # Dispatches to widget UI by type
│   │           └── AudioRecorder.svelte       # MediaRecorder: record/stop/playback/delete, MIME detection
│   └── routes/
│       ├── +layout.svelte                     # Root layout (imports app.css)
│       ├── +page.svelte                       # Landing page
│       ├── admin/
│       │   ├── +layout.server.ts              # Admin auth guard (checks locals.adminUser)
│       │   ├── +layout.svelte                 # Sidebar layout with nav links
│       │   ├── +page.server.ts                # Dashboard data load
│       │   ├── +page.svelte                   # Dashboard page
│       │   ├── login/
│       │   │   ├── +page.server.ts            # Login/logout form actions (Supabase Auth)
│       │   │   └── +page.svelte               # Login form UI
│       │   └── experiments/
│       │       ├── +page.server.ts            # listExperiments()
│       │       ├── +page.svelte               # Experiment cards with status badges + participant counts
│       │       ├── new/
│       │       │   ├── +page.server.ts        # createExperiment() action
│       │       │   └── +page.svelte           # Create form (slug + title + description → minimal config)
│       │       └── [id]/
│       │           ├── +page.server.ts        # saveConfig, updateStatus, delete actions (Zod validates on save)
│       │           ├── +page.svelte           # Edit page: Settings tab + Config tab (Form/JSON toggle)
│       │           ├── data/
│       │           │   ├── +page.server.ts    # getParticipants() + getExperimentStats()
│       │           │   ├── +page.svelte       # Participants table, stats panel, bulk delete, export
│       │           │   └── export/
│       │           │       └── +server.ts     # GET → CSV/JSON; style=raw|research, phase, dateFormat params
│       │           └── participants/
│       │               └── [participantId]/
│       │                   ├── +page.server.ts  # getParticipantDetail() + reset/delete form actions
│       │                   └── +page.svelte     # Registration data + responses by phase + CSV download
│       └── e/[slug]/
│           ├── +layout.server.ts              # Load experiment by slug (anon key), Zod validate
│           ├── +layout.svelte                 # Set experiment stores from server data
│           ├── +page.svelte                   # Registration: email step → form step → redirect
│           ├── auth/
│           │   └── +server.ts                 # POST: login/register/logout/check actions
│           ├── tutorial/
│           │   ├── +page.server.ts            # Verify session + load participant
│           │   └── +page.svelte               # Tutorial page with Driver.js overlay
│           ├── [phaseSlug]/
│           │   ├── +page.server.ts            # Load phase + responses (+ sourceResponses for review)
│           │   ├── +page.svelte               # Phase page: stimulus-response OR review
│           │   ├── save/
│           │   │   └── +server.ts             # POST: save response (validates session server-side)
│           │   └── upload/
│           │       └── +server.ts             # POST: upload audio file to Supabase Storage
│           ├── c/[chunkSlug]/[phaseSlug]/     # Chunked phase route
│           │   ├── +page.server.ts            # Block order (latin square/random), orderedStimulusIds, blockBoundaries, breakScreen
│           │   └── +page.svelte               # Thin wrapper importing phase page component
│           └── survey/                        # Legacy endpoints (duplicates of [phaseSlug] endpoints)
│               ├── save/+server.ts
│               └── upload/+server.ts
```

---

## 8. Participant Flow

```
/e/[slug]                            Registration page
  ├── Enter email → POST /e/{slug}/auth (action: 'login')
  ├── If returning: session cookie set, responses loaded, redirect to first phase
  └── If new: show registration form → POST /e/{slug}/auth (action: 'register')
      ├── If tutorial configured: redirect to /e/{slug}/tutorial
      └── Otherwise: redirect to /e/{slug}/{firstPhaseSlug}

/e/[slug]/tutorial                   Tutorial page (if configured)
  └── Driver.js overlay with step validation (click, input, play)
      └── On completion: redirect to first phase

/e/[slug]/[phaseSlug]                Phase page (main survey loop)
  ├── Server loads: participant (from session cookie), phase config, responses
  │   └── For review phases: also loads sourceResponses from source phase
  ├── Displays:
  │   ├── Stimulus (video/image/audio/text) OR review item (source response + stimulus)
  │   ├── Progress bar (completed count / total)
  │   └── Numbered item navigation buttons (green=completed, yellow=skipped, blue=current)
  ├── Gatekeeper question (if configured, not for review phases):
  │   ├── "Yes" → show response widgets
  │   └── "No" → save null response, advance to next
  ├── Response widgets filled → Save button
  │   ├── Audio blobs uploaded to Storage first
  │   ├── Response saved via POST /e/{slug}/{phaseSlug}/save
  │   └── Advance to next item (or stay if allowMultipleResponses)
  └── All items completed → completion modal:
      ├── "Continue to Next Phase" (if next phase exists)
      └── "Stay on Page"
```

### Review Phase Behavior

A review phase (`type: 'review'`) references another phase via `reviewConfig.sourcePhase`:

1. Server loads the source phase's responses AND the review phase's own responses
2. Client filters source responses (removes empty ones if `reviewConfig.filterEmpty: true`)
3. Each source response is displayed with:
   - The original stimulus (video/image/etc.) via `StimulusRenderer`
   - The original response data (text values, formatted timestamps)
   - A **replay button** for timestamp pairs — seeks video to start time, auto-pauses at end time via `timeupdate` event listener
4. The participant fills in review-specific widgets from `reviewConfig.responseWidgets`
5. The review response is saved with the source response's UUID as the `stimulus_id`
6. Completion modal works the same as stimulus-response phases

---

## 9. Admin Dashboard

### Routes

| Route | Purpose |
|-------|---------|
| `/admin/login` | Supabase Auth email/password login |
| `/admin` | Dashboard overview |
| `/admin/experiments` | List all experiments with status badges, participant counts, duplicate button |
| `/admin/experiments/new` | Create new experiment (slug + title + description → builds minimal valid config) |
| `/admin/experiments/[id]` | Edit experiment — two tabs: Settings + Config; config versioning panel |
| `/admin/experiments/[id]/data` | Participants table, stats panel, bulk delete, export options |
| `/admin/experiments/[id]/data/export` | GET → CSV or JSON download; `style=raw\|research`, `phase`, `dateFormat`, `includeRegistration` params |
| `/admin/experiments/[id]/participants/[participantId]` | Individual participant: registration data, all responses by phase, reset/delete actions |

### Config Editor (`ConfigEditor.svelte`)

The form-based config editor (~620 lines) provides editable UI for the entire JSON config:
- **Metadata section**: title, description (LocalizedInput), languages
- **Registration section**: introduction text, dynamic fields list (add/remove, all field types)
- **Phases section**: add/remove phases, type selector, slug/ID, stimulus order, checkboxes
  - For stimulus-response: gatekeeper question config, response widgets
  - For review: source phase selector, filterEmpty toggle, review-specific response widgets
- **Stimuli section**: type, source, storage path, items list
- **Widget editing**: type dropdown, ID, label (LocalizedInput), required toggle, config options per type

**Form ↔ JSON sync**: Switching Form→JSON serializes `configState` to `configJson`. Switching JSON→Form parses `configJson` back to `configState` (fails gracefully with error message if invalid JSON).

**Critical mutation pattern**: ConfigEditor receives `config` as a prop that is a Svelte 5 `$state` deep reactive proxy. It mutates the proxy directly — no `structuredClone`, no callbacks. The `update(path, value)` function walks a path array and sets the final key. Helper functions like `addWidget()`, `removeWidget()`, `addPhase()`, etc. mutate `config` directly (push, splice, property assignment). This is the correct Svelte 5 pattern.

**Unsaved changes detection**: The parent page (`[id]/+page.svelte`) computes `hasUnsavedChanges` by comparing `JSON.stringify(configState)` (or parsed `configJson`) to `savedConfigJson` (derived from `data.experiment.config`). The Save button shows a `●` dot indicator when unsaved changes exist.

**Save flow**: Form submits via `use:enhance`, serializes config from the active mode, sends as FormData to the `saveConfig` server action. Server parses JSON, validates with Zod, returns validation error messages if invalid, or updates the DB.

### Admin Auth Flow

1. User submits email + password at `/admin/login`
2. Server action calls `supabase.auth.signInWithPassword()`
3. Server checks `admin_users` table for the user's UUID
4. If valid: sets `admin_access_token` (1h maxAge) and `admin_refresh_token` (30d maxAge) as httpOnly cookies
5. `hooks.server.ts` middleware on every `/admin/*` request (except login):
   - Reads cookies, calls `getUser(accessToken)` to verify JWT
   - If expired: calls `refreshSession()` and updates cookies
   - If refresh fails: deletes cookies, redirects to login
   - Checks `admin_users` table via service role client
   - Sets `event.locals.adminUser = { id, email, role }`

---

## 10. Server-Side Data Layer

### `src/lib/server/data.ts` — Participant-Facing

| Function | Purpose |
|----------|---------|
| `findParticipantByEmail(experimentId, email)` | Login: find existing participant. Returns with `session_token` |
| `getParticipantByToken(sessionToken)` | Session validation: verify httpOnly cookie |
| `createParticipant(experimentId, email, registrationData)` | Registration: create participant, DB generates `session_token` |
| `rotateSessionToken(participantId)` | Generates and saves a new UUID session token; called on every login |
| `loadResponses(experimentId, participantId, phaseId?)` | Load all responses, optionally filtered by phase |
| `saveResponse(experimentId, participantId, phaseId, stimulusId, responseData, responseIndex)` | Append-only INSERT |
| `uploadFile(bucket, path, file, contentType, experimentId)` | Upload audio to Storage (validates type, size, path) |

### `src/lib/server/admin.ts` — Admin-Facing

| Function | Purpose |
|----------|---------|
| `listExperiments()` | All experiments + participant counts per experiment |
| `getExperiment(id)` | Single experiment by ID |
| `createExperiment(slug, config)` | INSERT with status 'draft' |
| `updateExperiment(id, { config?, status?, slug? })` | UPDATE selected fields + `updated_at` |
| `duplicateExperiment(id)` | Deep-clone experiment config with new slug (`{slug}-copy`); does not copy participants |
| `deleteExperiment(id)` | DELETE experiment (cascades to participants/responses) |
| `saveConfigVersion(experimentId, config)` | INSERT into `experiment_config_versions` with auto-incremented version number |
| `listConfigVersions(experimentId)` | List all versions (id, version_number, created_at) descending |
| `rollbackToVersion(experimentId, versionId)` | Apply a past version's config + save a new version record |
| `getParticipants(experimentId)` | Participants + response counts per participant |
| `getParticipantDetail(participantId)` | Single participant + all responses grouped by phase_id |
| `deleteParticipant(participantId)` | DELETE one participant (cascades to responses) |
| `resetParticipantResponses(participantId)` | DELETE all responses for a participant (keeps registration) |
| `deleteParticipants(participantIds[])` | Bulk DELETE participants |
| `getExperimentStats(experimentId)` | Per-phase participant counts + per-stimulus response counts |
| `getResponseData(experimentId)` | All rows from `response_flat` view, enriched with participant_id + registration_data |

### `src/lib/server/cookies.ts` — Shared Cookie Config

Exports `COOKIE_OPTIONS` (`path: '/'`, `httpOnly: true`, `sameSite: 'lax'`, `secure: !dev`). Imported by `hooks.server.ts`, `auth/+server.ts` (which extends it with `maxAge: 90 days`), and `admin/login/+page.server.ts`.

---

## 11. i18n System

### How It Works

`I18nStore` (`src/lib/i18n/index.svelte.ts`) is a Svelte 5 rune-based singleton with two methods:

1. **`i18n.platform(key, params?)`**: Dot-notation lookup from `src/lib/i18n/platform/{lang}.json` with `{var}` template interpolation. Used for static UI text.
   - Example: `i18n.platform('survey.fill_in_required', { field: 'Name' })` → `"Please fill in: Name"`

2. **`i18n.localized(obj, fallback?)`**: Picks the value for the current language from a `LocalizedString` object (`Record<string, string>`), falls back to English, then to `fallback`. Used for experiment-specific content from config.
   - Example: `i18n.localized({ en: "Hello", ja: "こんにちは" })` → `"Hello"` (if language is 'en')

**Language switching**: `i18n.setLanguage(lang)` dynamically imports the JSON file, caches it. Language selector in `Header.svelte`.

### Translation Categories

| Category | Key Count | Notable Keys |
|----------|----------|-------------|
| `common` | 20 | `loading`, `save`, `saving`, `saved_responses`, `registering_as` |
| `registration` | 14 | `welcome_back`, `new_participant`, error messages with `{error}` |
| `survey` | 12 | `completion_title`, `next_phase`, `stay_on_page`, `fill_in_required` |
| `tutorial` | 6 | `begin`, `skip`, `finish` |
| `review` | 4 | `source_response`, `no_items`, `item_label`, `replay` |
| `validation` | 6 | `required`, `min_length`, `max_length`, `min_value`, `max_value` |
| `audio` | 8 | `start_recording`, `recording`, `delete_rerecord`, error messages |
| `timestamps` | 3 | `start`, `end`, `not_set` |

---

## 12. Security

### Security Headers (set in `hooks.server.ts` on every response; CSP via `kit.csp` in `svelte.config.js`)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains    # production only
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-<random>';                  # nonce-bound, NO unsafe-inline
  style-src 'self' https://fonts.googleapis.com;       # NO unsafe-inline
  style-src-attr 'unsafe-inline';                       # narrow exception for Tailwind v4 inline styles
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: {SUPABASE_URL};
  media-src 'self' blob: {SUPABASE_URL};
  connect-src 'self' {SUPABASE_URL};
  frame-ancestors 'none'
```

SvelteKit's `kit.csp` mode `'auto'` injects per-response nonces into framework `<script>` tags. Inline event handlers (`onclick=""`) and inline `<style>` blocks are blocked.

### File Upload Validation (`src/lib/server/data.ts`)

- **Allowed types**: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`
- **Max size**: 50MB
- **Path traversal protection**: Strips `..` and `//`, validates path starts with `audio/{experimentId}/`

### Response Data

- Responses are **append-only** (no UPDATE RLS policy)
- Each save creates a new row with incrementing `response_index`
- CSV export sanitizes values against injection (leading `=`, `+`, `-`, `@`, `\t`, `\r`)

### Rate Limiting (Postgres-backed)

`checkRateLimit(ip, endpoint, max, windowSeconds)` from `$lib/server/rate-limit` calls the `rate_limit_check` RPC (migration 016). Sliding-window per-(IP, endpoint).
- `/auth`: 20 requests/min
- `/save`: 60 requests/min
- `/upload`: 30 requests/min
- State lives in Postgres — survives serverless cold starts. Stale rows cleaned via `cleanup_rate_limits()` (schedule via `pg_cron` or periodic admin endpoint). Returns 429 when exceeded.

### CSRF Protection

- SvelteKit form actions have built-in CSRF protection
- API endpoints (`+server.ts`) verify `Origin` header matches app origin on POST/PUT/DELETE
- In production, empty `Origin` header is also blocked (requests must include Origin)
- Cross-origin requests are blocked with 403

### Session Security

- **Token rotation**: `rotateSessionToken()` in `data.ts` generates a new UUID on every login and updates the DB. The browser always receives a fresh token.
- **Registration validation**: The auth endpoint validates all required registration fields against `config.registration.fields` (respecting `conditionalOn` visibility) and returns 400 for missing required fields.
- **Response validation**: The save endpoint validates `phaseId` (must exist in config), `stimulusId` (must exist in `stimuli.items`), and `responseData` keys (must match the phase's `responseWidgets[].id`). Returns 400 on mismatch.

### Error Messages

All `throw` calls in `src/lib/server/admin.ts` and `src/lib/server/data.ts` use generic messages (e.g., `"Failed to load participants"`) — raw Supabase/Postgres error details are logged server-side via `console.error()` and never surfaced to the browser.

### Audit + Error Logs

- **`admin_audit_log`** (migration 017, append-only): mutating admin actions write a row via `logAdminAction()` from `$lib/server/audit`. The `experiment_id` FK is `ON DELETE SET NULL` — audit rows survive experiment deletion. **In delete actions, call audit BEFORE the cascade delete** (inserting a row pointing at an already-deleted parent violates the FK at INSERT time).
- **`error_log`** (migration 019): `reportError()` from `$lib/server/errors` writes to Postgres by default; the abstraction is Sentry-swappable. Wired into SvelteKit's `handleError` hook for unhandled 500s.

### Optimistic Locking

Config saves and rollbacks pass `expected_updated_at` to the `upsert_config_with_version` RPC (migration 014). Mismatch raises `P0004`, surfaced as a 409 with the "modified by another admin" toast. Both `saveConfigWithVersion` AND `rollbackToVersion` plumb this through.

### Admin User Lookup

`hooks.server.ts` uses `.maybeSingle()` (not `.single()`) when checking the `admin_users` table. This ensures a valid Supabase Auth user who is not in `admin_users` gets a clean redirect to `/admin/login` rather than a 500 error.

### Environment Variable Validation

`src/lib/server/supabase.ts` validates at module load:
- `PUBLIC_SUPABASE_URL` must start with `https://`
- `SUPABASE_SERVICE_ROLE_KEY` must be non-empty (length >= 20)
- Throws a clear error message on misconfiguration (fail-fast)

---

## 13. Svelte 5 Patterns & Gotchas

**These are critical patterns that any agent working on this codebase MUST understand:**

### 1. `$state` Proxy Mutation (Most Critical)

Svelte 5's `$state()` creates a deep reactive proxy. When you pass a `$state` object as a prop, the child holds the **same proxy reference**. Direct mutations on the proxy are tracked and reactive:

```typescript
// Parent: let configState = $state<ExperimentConfig>(structuredClone(data));
// Child receives config prop (same proxy):
config.metadata.title.en = 'New Title';      // ✅ Reactive
config.phases.push(newPhase);                  // ✅ Reactive
config.registration.fields.splice(i, 1);       // ✅ Reactive
```

**NEVER** use `structuredClone(prop)` → callback → reassign. It breaks because the clone is a separate object, not the tracked proxy.

### 2. SvelteKit `redirect()` in try/catch

`redirect()` throws internally. Always re-throw if caught:

```typescript
import { isRedirect, isHttpError } from '@sveltejs/kit';
try { /* code that might redirect */ }
catch (err) {
    if (isRedirect(err)) throw err;
    if (isHttpError(err)) throw err;
    // handle actual errors
}
```

### 3. `update({ reset: false })` in use:enhance

SvelteKit's `update()` calls `form.reset()` by default, clearing all form inputs including textareas. Always use `await update({ reset: false })`.

### 4. `$effect` + `form` Timing Issue

After `update({ reset: false })`, the `form` prop updates first, THEN SvelteKit re-runs `load` to update `data`. An `$effect` watching `form?.success` fires before `data` is refreshed — reading `data` gives stale values. **Don't re-sync state from `data` inside an `$effect` triggered by `form`.**

### 5. `$derived` Over `$state` + `$effect`

Prefer `$derived` for computed values. Using `$state` initialized by `$effect` causes one frame of stale data (render happens before effect runs).

### 6. Buttons in Forms

All `<button>` inside `<form>` must have explicit `type="button"` or `type="submit"`. HTML defaults to `submit`, causing accidental form submissions.

### 7. Tailwind Arbitrary Values

`h-[calc(...)]` can be unreliable in Tailwind 4. Prefer inline `style` attribute for dynamic sizing.

### 8. `{@const}` Placement

In Svelte 5, `{@const}` must be an **immediate child** of `{#each}`, `{#if}`, `{:else}`, etc. It cannot be placed inside HTML elements within those blocks — it must come directly after the block opening tag.

---

## 14. Development Phases — Completed

### Phase 1: Foundation
- Zod config schema with full type exports
- Database tables, indexes, initial RLS
- Registration flow (email → conditional form → Supabase)
- i18n system (EN/JA) with language switcher

### Phase 2: Stimulus + Response
- VideoPlayer (constructs Supabase Storage URLs)
- StimulusRenderer (dispatches by stimulus type)
- StimulusNav (numbered buttons with green/yellow/blue states)
- All widget types: text, textarea, select, number, likert, timestamp-range, audio-recording
- Save/load responses, completion modal, ProgressBar
- AudioRecorder with MediaRecorder API

### Phase 2.5: Store Migration
- Migrated from Svelte 4 writables to Svelte 5 rune-based class stores (`.svelte.ts`)

### Phase 2.75: Security Hardening
- All Supabase mutations moved server-side (service role key only)
- Session token httpOnly cookies for participants
- Tightened RLS (append-only responses, removed anon SELECT on sensitive tables)
- CSP headers, Permissions-Policy, Referrer-Policy, X-Frame-Options

### Phase 3: Multi-Phase + Tutorial
- Multi-phase system: each phase has own URL, widgets, completion
- Review phases: load source responses, display with stimulus, collect review widgets
- Tutorial: Driver.js overlay with step validation (click, input, play)
- Gatekeeper questions with yes/no skip logic
- Phase completion modal with "Next Phase" navigation (always shows if next phase exists)

### Phase 4: Admin Dashboard
- Supabase Auth admin login (verified against `admin_users` table)
- Experiment list with status badges and participant counts
- Create experiment (slug + title + description → minimal valid config)
- Edit experiment: Settings tab (status, info, delete) + Config tab (Form/JSON toggle)
- ConfigEditor: full form-based editor with type-aware widget routing for review phases
- Form ↔ JSON sync, unsaved changes indicator (●)
- Zod validation on save with error message display
- Participants data table + CSV export with injection protection

### Post-Phase-4 Bug Fixes (2026-03-19)

1. **Form mode edits not saving**: `structuredClone` + callback pattern broke Svelte 5 proxy reactivity. Fixed: ConfigEditor now mutates the `$state` proxy directly.
2. **JSON textarea blank after save**: `update()` was resetting form. Fixed: `update({ reset: false })`.
3. **Missing "Next Phase" button**: Was gated on optional `nextPhaseButton` config field. Fixed: always shows if next phase exists, uses i18n fallback.
4. **Review widgets not appearing**: ConfigEditor wrote widgets to `phase.responseWidgets` for all phase types. Fixed: type-aware `addWidget`/`removeWidget`/`widgetPath` functions that route to `reviewConfig.responseWidgets` for review phases.
5. **Timestamp replay in review**: Added `ReviewItemDisplay` with `_start`/`_end` key pair detection, formatted time display, and replay button (seeks video, auto-pauses at end time).

### Technical Debt Cleanup (2026-03-19)

- **`response_flat` SECURITY DEFINER fix**: Migration 006 recreates view with `security_invoker = true`
- **Legacy endpoints removed**: Deleted duplicate `src/routes/e/[slug]/survey/{save,upload}`
- **Environment variable validation**: Fail-fast on invalid/missing Supabase config
- **Rate limiting**: In-memory sliding window on `/auth`, `/save`, `/upload` endpoints
- **CSRF origin checking**: All API POST endpoints verify `Origin` header

### Phase 5: Production Readiness (2026-03-19)

- **Deployed to Vercel**: Switched from `adapter-auto` to `@sveltejs/adapter-vercel`, deployed and verified working (reads/writes to Supabase confirmed)
- **`slider` widget implemented**: `<input type="range">` with min/max/step, endpoint labels, live value display
- **`multiselect` widget implemented**: Toggle buttons, comma-separated storage
- **`random-per-participant` ordering**: Deterministic seeded shuffle using djb2 hash + mulberry32 PRNG + Fisher-Yates. Seed = `participantId + phaseId` for consistent cross-session ordering
- **Data migration**: Participants and responses from two legacy Google Sheets experiments migrated into Supabase via `scripts/migrate-previous-data.js`. Audio recordings uploaded via `scripts/upload-previous-audio.js`.

### Phase 6: Enhanced Admin Features (2026-03-22)

- **Config editor completeness**: Tutorial editing, per-phase introduction/completion, widget config options (min/max/labels/charCount), stimuli management (add/remove/reorder), registration field validation — all exposed in form mode
- **Experiment duplication**: "Duplicate" button creates `{slug}-copy` with deep-cloned config (including `config.slug` patched); status `draft`; no participants copied
- **Participant management**: Individual detail pages (all responses + registration data), reset responses, delete, bulk delete
- **Stats panel**: Per-phase participant started counts, stimulus response distribution bar chart
- **Enhanced CSV export**: `style=research` merges phases side-by-side, expands `response_data` keys into individual columns, one row per (participant × stimulus × response_index). Also: JSON format, timestamp formatting, registration data columns, phase filter, per-participant download
- **Config versioning**: Every save creates a version in `experiment_config_versions`; rollback to any past version; warning when editing config with active participants (migration 007)

### Code + Security Audit (2026-03-22)

- **`.env` verified clean**: Never committed to git; `.gitignore` correctly excludes `env*`
- **DB errors sanitised**: All server functions use generic messages; raw Supabase errors logged server-side only
- **`.single()` → `.maybeSingle()`**: Fixed in `hooks.server.ts` admin_users lookup — prevents 500 for non-admin Supabase users
- **`COOKIE_OPTIONS` deduplicated**: Extracted to `src/lib/server/cookies.ts`; removed 3 identical definitions
- **`getAdminUser()` removed**: Dead code; admin auth fully handled in `hooks.server.ts`
- **`_timestamp` removed**: Client-side `_timestamp` in `response_data` was redundant with server-side `created_at`; removed from save paths
- **Audio listener leak fixed**: `ReviewItemDisplay.svelte` — stacked `timeupdate` listeners on replay now cleared via `activeTimeUpdateListener` tracking
- **Rate limiter serverless caveat documented**: Comment added in `hooks.server.ts`

### Phase 6.7: Bug Fixes & Minor Features (2026-03-24)

- **`allowRevisit` fix**: `<StimulusNav>` hidden entirely when `allowRevisit=false` (was silently blocking clicks)
- **Admin form field additions**: Placeholder, Default Value, showConditionalField (registration); Step Number, Step Label, Placeholder (widgets); Type override, Label (stimuli items); Sample Stimuli checkboxes, Introduction page (tutorial); Review Mode (timestamp-range)
- **Timestamp review button**: Shared replay controller (`src/lib/utils/replay.ts`), Review button on timestamp-range widgets
- **Tutorial introduction page**: Optional intro before tutorial welcome modal

### Security Hardening (2026-03-24)

- **CSRF tightened**: Production now blocks empty `Origin` header (not just wrong Origin)
- **Session token rotation**: `rotateSessionToken()` called on every login; fresh token every session
- **Registration validation**: Server validates required fields in auth endpoint against config schema
- **Response validation**: Save endpoint validates phaseId, stimulusId, and widget key names against config

### Phase 8.3: Conditional Logic (2026-03-24)

- **Conditional widget visibility**: `conditionalOn: { widgetId, value }` on `ResponseWidget`; `isWidgetVisible()` in phase page; hidden widgets excluded from validation and saved as `null`; admin UI toggle + widget dropdown + value input
- **Skip stimuli**: `SkipRule` schema; async `advanceToNext()` evaluates rules and calls `autoSkipStimulus()` (saves `_skipped_by_rule` response for all widgets); admin UI with target/source stimulus + widget + operator + value dropdowns
- **Branching phases**: `BranchRule` schema; `resolveNextPhase()` + `evaluateBranchCondition()` in phase page; first matching rule wins, fallback sequential; admin UI with condition + target phase dropdowns

### Phase 8.4: Break Screens + Block Completion (2026-03-24)

- **Break screens**: `BreakScreen` schema in `ChunkingConfig`; modal with countdown timer appears when crossing block boundaries; admin UI in ChunkingSection
- **Block boundaries**: Chunked route server (`c/[chunkSlug]/[phaseSlug]/+page.server.ts`) computes and returns `blockBoundaries[]` with start/end indices per block
- **Block progress display**: "Block 2/5 — 3/10 completed" shown below progress bar on chunked phases
- **Admin UI**: Break screen title/body/duration config in ChunkingSection

### Performance: Admin Pagination (2026-03-24)

- **StimuliSection pagination**: 20 items per page with prev/next controls; search/filter by ID, filename, or URL; item indices always reference the full array for correct `update()` calls
- Pagination only shown when items count > 20 (no UI clutter for small experiments)

### Tests (2026-03-24)

- **46 schema tests** in `schema.test.ts` (was 13): added `conditionalOn`, `skipRules` (with/without stimulusId), `branchRules`, `breakScreen` (with/without duration), `allowRevisit`, `stepNumber/stepLabel`, `placeholder/defaultValue`, `chunking`
- **15 seededShuffle + latinSquareOrder tests** in `utils/index.test.ts`
- **12 replay controller tests** in `utils/replay.test.ts`

### Phase 7: Multi-Admin Collaboration + Hardening (2026-04-18 → 2026-04-19)

**Multi-admin collaborator model** (migration 015):
- `experiment_collaborators(experiment_id, user_id, role)` with role ∈ {owner, editor, viewer}; auto-add-creator + owner-invariant triggers
- `pending_invites` for email invites; `claimInvitesForUser()` runs at next admin login
- Every admin route guards via `requireExperimentAccess(adminUser, expId, minRole)` from `$lib/server/collaborators`
- Non-collaborators get **404** (hide existence), not 403
- Owner-invariant trigger short-circuits during cascade-delete (migration 021) — without this fix, sole owners could not delete their own experiments

**Atomic + concurrency-safe RPCs**:
- `upsert_config_with_version` (migration 014) with `expected_updated_at` optimistic lock; raises `P0004` on conflict; plumbed through both `saveConfigWithVersion` AND `rollbackToVersion`
- `set_chunk_assignment` (migration 009, predates this phase but exercised by R1 race tests)

**Postgres-backed rate limiter** (migration 016): replaces in-memory limiter; survives serverless cold starts.

**Audit + error logging** (migrations 017, 019): `admin_audit_log` (append-only) + `error_log` (Sentry-swappable abstraction in `$lib/server/errors`).

**Round-robin distribution fix**: `getParticipantIndex` ranks by `registered_at` ASC (with id tie-break for same-`now()` bulk inserts), not lexicographic UUID. Fixes latin-square round-robin distribution at the participant cohort level.

**Schema hardening** (migration 018): `participants.last_rotated_at` for time-based session rotation (24h).

**Read-side optimisations** (migration 020): aggregate count views with `security_invoker = true` for admin list/detail panels.

**CSP via SvelteKit nonces**: `kit.csp` mode `'auto'`. `script-src` now nonce-bound; `unsafe-inline` removed from both `script-src` and `style-src`. Narrow `style-src-attr 'unsafe-inline'` retained for Tailwind v4 inline styles.

**A11y**: `Field.svelte` wrapper provides implicit label-input association across the entire admin config editor (cleared 78 a11y warnings).

**E2E test infrastructure**:
- Playwright + per-test-isolated `ctx` fixture creating a unique admin per test
- Local-Supabase safety guard refuses non-local `PUBLIC_SUPABASE_URL` without explicit env opt-in
- 74 specs covering admin CRUD, collaborators, config editor + optimistic lock, version restore, access matrix, IDOR, audit + error logs, CSRF, headers, CSP/HSTS preview, rate limit, registration, phase traversal, review-phase UUID gotcha, tutorial, chunking + latin-square (incl. strict round-robin verification at N=9), completion + feedback, bulk import (storage + CSV), claim-invite via Inbucket
- Standalone race scripts under `scripts/race/` (R1/R2/R3)
- CI workflow at `.github/workflows/ci.yml` boots local Supabase and runs the suite

**Bulk stimulus import wired**: `BulkImportModal.svelte` (which had been complete-but-orphaned) is now reachable from `StimuliSection.svelte` via a header-level "Bulk import" button. Storage tab gates on prereqs (source=`supabase-storage` + `storagePath`); merge strategy defaults to `replace` when items list is empty, `append` otherwise.

**Other root-cause fixes** (per CLAUDE.md philosophy):
- Duplicate-slug create surfaces `Slug "X" is already taken` instead of opaque "Failed to create"
- Viewer Save Config button hidden via `data.myRole` gate (was rendering but always 403'd)
- Config editor `●` dirty indicator: canonical key-sorted JSON comparison + post-save re-sync (was permanently dirty due to JSONB key reordering + Zod default fill-in)
- Participant IDOR returns 404, not 500 (`getParticipantDetail` returns null on miss)
- Stale `session_token` cookie cleared when the participant row is gone (was producing redirect loops; theoretical token-reattachment hazard on backup restore)
- Participant language preference no longer reset to `defaultLanguage` on every layout mount (silent UX bug — selection vanished within one nav)

---

## 15. What Is Left To Do

### Known Gaps
- **No pagination**: Experiment list and participants list load everything at once (Phase 10.2)
- **Database backups**: Supabase automated backups not yet configured (pre-launch checklist)
- **Pilot testing**: 5-10 participants through full flow not yet done (Phase 5.5)
- **`rate_limits` cleanup not scheduled**: `cleanup_rate_limits()` exists but isn't wired to `pg_cron` or a periodic admin endpoint yet
- **Tier-4 E2E gaps** (low-stakes edges, not blockers): A1.5 refresh-token rotation, P3.3/P3.4/P3.6 widget edge cases, P7.2 Driver.js click-gate, P9 i18n switching, P2 session-rotation timing, S2.3 per-IP rate-limit assertion (requires deployed adapter to honour `X-Forwarded-For`)

### Potential Future Features (see `FUTURE_PLANS.md` for full roadmap)
- More widget types: image annotation, ranking/sorting, matrix/grid, comparison (Phase 8.1)
- More stimulus types: audio stimuli player, rich text, multi-stimulus A/B (Phase 8.2)
- Participant quotas and condition assignment (Phase 8.5)
- In-app analytics dashboard: response distributions, completion funnel (Phase 9.1)
- Inter-rater reliability calculations (Phase 9.2)
- Multi-experiment aggregation views (Phase 9.3)
- Multi-tenant / team support with role-based permissions (Phase 10.1)
- Audio file bulk download as ZIP (Phase 6.4, deferred)
- Sentry error monitoring (Phase 5b)

---

## 16. Previous Experiment Data (Pre-Migration)

Data from two experiments run on the original vanilla JS platform, stored in `previous_expe_data/`:

### `movement-to-onomatopoeia` → platform slug `movement-onomatopoeia`
- **Participants**: 17 (IDs 0-16), `_Participants.csv` — columns: participantId, email, name, age, gender, movementPractice, nativeLanguage, signUpDate
- **Responses**: 242 rows, `_Onomatopoeia.csv` — columns: participantId, participantName, video, onomatopoeia, startTime, endTime, answeredTimestamp, HasAudio, AudioFileName, reasoning, reasoningTimestamp
  - 101 rows with empty onomatopoeia (gatekeeper "No"/skipped)
  - 74 rows with reasoning (review phase data, stored in same sheet)
  - 21 audio recordings in `previous_expe_data/audio/` (organized by participant folder)
- **Name mapping**: `_Names.csv` — 144 rows mapping `new_name` (e.g., `4.mp4`) to `original_name` (e.g., `JP_01_contempt_1_M`)
- **Config**: 144 stimuli, 2 phases, gatekeeper, tutorial

### `mvt-description` → platform slug `movement-description`
- **Participants**: 6 (IDs 0, 1, 3, 5, 7, 8 — sparse numbering), `_Participants.csv` — columns: participantId, email, name, age, gender, nativeLanguage, signUpDate (no movementPractice field)
- **Responses**: 271 rows, `_Movements.csv` — columns: participantId, participantName, video, movement, startTime, endTime, answeredTimestamp, HasAudio, AudioFileName, emotion
  - Multiple responses per (participant, video) — 42 cases — representing different movement segments with different timestamps
  - All 271 rows have emotion filled in, 0 audio files
- **Name mapping**: `_Names.csv` — 70 rows mapping `new_name` to `original_name` (e.g., `JP_06_anger_3_M`)
- **Videos**: 70 files in Supabase Storage at `stimuli/movement-description/`
- **Config**: Needs to be created (not yet in admin dashboard)

---

## 17. Running the Project

```bash
cd /Users/victor/projects/experiment-platform

# Install dependencies
npm install

# Start dev server
npm run dev                    # → http://localhost:5173/

# Access experiment (must have status 'active')
# → http://localhost:5173/e/movement-onomatopoeia/

# Access admin dashboard (requires admin_users table entry)
# → http://localhost:5173/admin/

# Type check
npm run check                  # or: npx svelte-check

# Production build
npm run build

# Re-seed config into DB (after editing JSON)
node scripts/seed.js

# Upload all videos to Supabase Storage (requires 'experiments' bucket)
node scripts/upload-all-videos.js
```

---

## 18. File Quick Reference

| What You Need | File |
|---------------|------|
| Config schema / all types | `src/lib/config/schema.ts` |
| Auth middleware + security headers | `src/hooks.server.ts` |
| Participant data functions | `src/lib/server/data.ts` |
| Admin data functions | `src/lib/server/admin.ts` |
| Service role Supabase client | `src/lib/server/supabase.ts` |
| Anon Supabase client | `src/lib/services/supabase.ts` |
| Shared type interfaces | `src/lib/services/data.ts` |
| Experiment store | `src/lib/stores/experiment.svelte.ts` |
| Participant store | `src/lib/stores/participant.svelte.ts` |
| Response store | `src/lib/stores/responses.svelte.ts` |
| i18n store | `src/lib/i18n/index.svelte.ts` |
| English translations | `src/lib/i18n/platform/en.json` |
| Japanese translations | `src/lib/i18n/platform/ja.json` |
| Registration page | `src/routes/e/[slug]/+page.svelte` |
| Auth endpoint (login/register) | `src/routes/e/[slug]/auth/+server.ts` |
| Phase page (survey + review) | `src/routes/e/[slug]/[phaseSlug]/+page.svelte` |
| Phase server load | `src/routes/e/[slug]/[phaseSlug]/+page.server.ts` |
| Save response endpoint | `src/routes/e/[slug]/[phaseSlug]/save/+server.ts` |
| File upload endpoint | `src/routes/e/[slug]/[phaseSlug]/upload/+server.ts` |
| Review item display + replay | `src/lib/components/review/ReviewItemDisplay.svelte` |
| Widget dispatcher | `src/lib/components/widgets/WidgetRenderer.svelte` |
| Audio recorder | `src/lib/components/widgets/AudioRecorder.svelte` |
| Video player | `src/lib/components/stimuli/VideoPlayer.svelte` |
| Tutorial overlay | `src/lib/components/tutorial/TutorialOverlay.svelte` |
| Admin config editor | `src/lib/components/admin/ConfigEditor.svelte` |
| Admin experiment edit page | `src/routes/admin/experiments/[id]/+page.svelte` |
| Admin experiment server actions | `src/routes/admin/experiments/[id]/+page.server.ts` |
| CSV export endpoint | `src/routes/admin/experiments/[id]/data/export/+server.ts` |
| Database migrations | `supabase/migrations/001-021_*.sql` |
| Collaborator access control | `src/lib/server/collaborators.ts` |
| Audit log helper | `src/lib/server/audit.ts` |
| Error reporting abstraction | `src/lib/server/errors.ts` |
| Postgres-backed rate limiter | `src/lib/server/rate-limit.ts` |
| Pagination async generator | `src/lib/server/pagination.ts` |
| Bulk import modal | `src/lib/components/admin/config/BulkImportModal.svelte` |
| Collaborators panel | `src/lib/components/admin/CollaboratorsPanel.svelte` |
| Field wrapper (a11y) | `src/lib/components/admin/config/Field.svelte` |
| E2E fixtures + helpers | `tests/e2e/fixtures.ts`, `tests/e2e/seed.ts` |
| Race-condition driver scripts | `scripts/race/r1-r3-*.ts` |
| CI workflow | `.github/workflows/ci.yml` |
| Experiment configs (local) | `configs/` (gitignored) |
| DB seeding script | `scripts/seed.js` |
| Config migrator | `scripts/migrate-configs.ts` |
