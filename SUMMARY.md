# Experiment Platform — Comprehensive Project Summary

> **Purpose**: This document is written for AI agents. It contains everything needed to understand, navigate, and continue development on this project without prior context.
>
> **Last updated**: 2026-03-19
> **Build status**: 0 type errors, production build succeeds (`npx svelte-check` passes, `npm run build` succeeds)

---

## 1. What This Project Is

A **config-driven experiment/survey platform** for academic research data collection. One SvelteKit deployment serves unlimited experiments — each experiment is defined entirely by a JSON config (validated by Zod, stored as JSONB in Supabase Postgres) and accessed at `/e/{slug}/`. No code changes or redeployment are needed per experiment.

**Origin**: Generalizes a vanilla JS research app (`/Users/victor/projects/movement-to-onomatopoeia/`) that collected onomatopoeia responses to 144 point-light motion capture videos, using Google Sheets + Google Drive. This platform replaces that with a proper database-backed, multi-experiment system.

**First experiment**: `movement-onomatopoeia` — participants watch point-light motion videos, write onomatopoeia, mark timestamps, and optionally record audio. Bilingual EN/JA. Config at `configs/movement-onomatopoeia.json` (144 stimuli, 3 response widgets, gatekeeper question, tutorial).

**Two user roles**:
- **Participants**: Register via email, complete multi-phase experiments (stimulus-response + review phases), record audio, annotate timestamps
- **Admins**: CRUD experiments, edit configs via Form or JSON editor, view participant data, export CSV

---

## 2. Tech Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Framework | SvelteKit | v2.50+, `@sveltejs/adapter-auto` |
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

### Tables (defined in `supabase/migrations/001_initial_schema.sql`)

```sql
experiments     (id UUID PK, slug TEXT UNIQUE, status TEXT CHECK(draft|active|paused|archived), config JSONB, created_by UUID, created_at, updated_at)
participants    (id UUID PK, experiment_id UUID FK, email TEXT, registration_data JSONB, session_token UUID UNIQUE NOT NULL, registered_at)
                UNIQUE(experiment_id, email)
responses       (id UUID PK, experiment_id UUID FK, participant_id UUID FK, phase_id TEXT, stimulus_id TEXT, response_data JSONB, response_index INT DEFAULT 0, created_at, updated_at)
file_uploads    (id UUID PK, response_id UUID FK, experiment_id UUID FK, participant_id UUID FK, widget_id TEXT, storage_path TEXT, file_type TEXT, file_size INT, created_at)
admin_users     (user_id UUID PK FK auth.users, role TEXT CHECK(admin|researcher), created_at)
```

### Views

```sql
response_flat   -- Joins responses + experiments + participants for CSV export
                -- Columns: id, experiment_slug, participant_email, participant_name, phase_id, stimulus_id, response_data, response_index, created_at, updated_at
```

### RLS Policy Evolution (5 migrations)

| Migration | What Changed |
|-----------|-------------|
| `001_initial_schema.sql` | Creates all tables, indexes (including GIN on JSONB columns), and `response_flat` view |
| `002_rls_policies.sql` | Initial permissive RLS: public INSERT/SELECT/UPDATE on all tables |
| `003_tighten_rls.sql` | Drops permissive policies. INSERT requires valid active `experiment_id` (participants) and valid `participant_id` matching experiment (responses). Removes UPDATE on responses (append-only). SELECT remains `USING(true)` with note about auth.uid() limitation |
| `004_session_security.sql` | Adds `session_token UUID DEFAULT gen_random_uuid()` NOT NULL UNIQUE to `participants`. Backfills existing rows |
| `005_remove_anon_select.sql` | Drops anon SELECT on `participants`, `responses`, `file_uploads`. Only `experiments` remains anon-readable. All sensitive data reads are now server-side via service role key |

### Current Security Model Summary

- **Anon key can**: SELECT from `experiments` (active configs only), INSERT into `participants`/`responses`/`file_uploads` (with reference checks)
- **Anon key cannot**: SELECT from `participants`/`responses`/`file_uploads`, UPDATE anything, DELETE anything
- **Service role key**: Full unrestricted access (used server-side only)

---

## 6. Experiment Config Schema

The config is the central data structure. Full Zod schema: `src/lib/config/schema.ts` (224 lines).

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
│   ├── welcome: { title, body, buttonText }
│   ├── steps: TutorialStep[]
│   │   ├── id, targetSelector (CSS selector), title, body: LocalizedString
│   │   ├── instruction: LocalizedString?, position: top|bottom|left|right|center
│   │   └── validation: { type: click|input|play|none, target?: string }?
│   ├── completion: { title, body, buttonText }
│   └── sampleStimuliIds: string[]
├── phases: PhaseConfig[] (min 1)
│   ├── id, slug, type: "stimulus-response" | "review"
│   ├── title: LocalizedString
│   ├── introduction: { title, body }?
│   ├── gatekeeperQuestion?
│   │   ├── text, yesLabel, noLabel: LocalizedString
│   │   ├── noResponseValue: string (default "null")
│   │   └── skipToNext: boolean (default true)
│   ├── responseWidgets: ResponseWidget[]       # For stimulus-response phases
│   ├── reviewConfig?                           # For review phases
│   │   ├── sourcePhase: string                 # References another phase's id
│   │   ├── filterEmpty: boolean (default true)
│   │   └── responseWidgets: ResponseWidget[]   # Widgets specific to the review phase
│   ├── stimulusOrder: "sequential" | "random" | "random-per-participant"
│   ├── allowRevisit: boolean (default true)
│   ├── allowMultipleResponses: boolean (default false)
│   └── completion: PhaseCompletion
│       ├── title, body: LocalizedString
│       ├── nextPhaseButton: LocalizedString?   # If absent, falls back to i18n key
│       └── stayButton: LocalizedString?        # If absent, falls back to i18n key
├── stimuli
│   ├── type: "video" | "image" | "audio" | "text" | "mixed"
│   ├── source: "upload" | "external-urls" | "supabase-storage" (default)
│   ├── storagePath: string?
│   └── items: StimulusItem[]
│       ├── id, type?, url?, filename?
│       ├── label: LocalizedString?
│       └── metadata: Record<string, any>?
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
| `multiselect` | (schema defined, not rendered) | `options` | — |
| `number` | `<input type="number">` | `min`, `max`, `step` | `{widgetId}: "value"` |
| `likert` | Row of clickable number buttons | `min`, `max`, `minLabel`, `maxLabel` | `{widgetId}: "3"` |
| `slider` | (schema defined, not rendered) | `min`, `max`, `step`, `minLabel`, `maxLabel` | — |
| `timestamp-range` | Two buttons capturing `mediaElement.currentTime` | `captureStartLabel`, `captureEndLabel` | `{widgetId}_start: "1.23"`, `{widgetId}_end: "4.56"` |
| `audio-recording` | MediaRecorder with record/stop/playback/delete | `maxDurationSeconds`, `maxFileSizeMB` | `{widgetId}: "storage/path.webm"` |

**Timestamp-range storage detail**: The widget internally uses a comma-separated string `"start,end"` that gets split on save into two separate keys: `{widgetId}_start` and `{widgetId}_end`. On review, `ReviewItemDisplay` detects these pairs and shows a replay button.

---

## 7. Directory Structure

```
experiment-platform/
├── .env.example                          # Template for environment variables
├── package.json                          # npm deps, scripts
├── svelte.config.js                      # adapter-auto, no custom aliases
├── tsconfig.json                         # Strict, extends .svelte-kit/tsconfig
├── vite.config.ts                        # Plugins: tailwindcss() + sveltekit()
├── HANDOFF.md                            # Original handoff doc (from Phase 2)
├── SUMMARY.md                            # This file
├── configs/
│   ├── movement-onomatopoeia.json        # Primary experiment (144 stimuli, EN/JA)
│   └── movement-description.json         # Secondary experiment config
├── scripts/
│   ├── seed.js                           # Upsert config JSON into experiments table
│   ├── upload-test-videos.js             # Upload first 3 videos to Supabase Storage
│   └── upload-all-videos.js              # Upload all 144 videos with progress bar
├── supabase/migrations/                  # 5 SQL migration files (see section 5)
├── src/
│   ├── app.css                           # Tailwind import + custom styles (buttons, spinner, modal, message)
│   ├── app.d.ts                          # App.Locals: { sessionToken: string|null, adminUser: {id,email,role}|null }
│   ├── app.html                          # HTML shell
│   ├── hooks.server.ts                   # Session parsing, admin auth middleware, security headers
│   ├── lib/
│   │   ├── index.ts                      # Empty placeholder for $lib alias
│   │   ├── config/
│   │   │   └── schema.ts                 # Full Zod schema (224 lines) + all type exports
│   │   ├── i18n/
│   │   │   ├── index.svelte.ts           # I18nStore class: platform() + localized()
│   │   │   └── platform/
│   │   │       ├── en.json               # English translations (93 lines)
│   │   │       └── ja.json               # Japanese translations (91 lines)
│   │   ├── server/
│   │   │   ├── supabase.ts              # Service role client singleton (getServerSupabase())
│   │   │   ├── data.ts                  # Participant/response CRUD + file upload (141 lines)
│   │   │   └── admin.ts                 # Admin CRUD + data export (151 lines)
│   │   ├── services/
│   │   │   ├── supabase.ts              # Anon client (browser-safe, used minimally)
│   │   │   └── data.ts                  # Shared interfaces: ParticipantRecord, ResponseRecord
│   │   ├── stores/
│   │   │   ├── experiment.svelte.ts     # ExperimentStore: config, id + getters
│   │   │   ├── participant.svelte.ts    # ParticipantStore: current user, isAuthenticated
│   │   │   └── responses.svelte.ts      # ResponseStore: list, currentIndex, completedStimuli, byStimulus
│   │   ├── utils/
│   │   │   └── index.ts                 # obtainDate() helper
│   │   └── components/
│   │       ├── admin/
│   │       │   ├── ConfigEditor.svelte       # Full form editor for experiment config (~620 lines)
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
│   │       │   └── ReviewItemDisplay.svelte  # Source response display + timestamp pair detection + replay button
│   │       ├── stimuli/
│   │       │   ├── StimulusRenderer.svelte   # Dispatches to VideoPlayer/img/audio/text by type
│   │       │   └── VideoPlayer.svelte        # Constructs Supabase Storage URL, renders <video>
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
│       │           └── data/
│       │               ├── +page.server.ts    # getParticipants()
│       │               ├── +page.svelte       # Participants table with response counts
│       │               └── export/
│       │                   └── +server.ts     # GET → CSV download from response_flat view
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
| `/admin/experiments` | List all experiments with status badges and participant counts |
| `/admin/experiments/new` | Create new experiment (slug + title + description → builds minimal valid config) |
| `/admin/experiments/[id]` | Edit experiment — two tabs: Settings + Config |
| `/admin/experiments/[id]/data` | Participants table with email, registration data, response counts |
| `/admin/experiments/[id]/data/export` | GET → CSV download from `response_flat` view |

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
| `loadResponses(experimentId, participantId, phaseId?)` | Load all responses, optionally filtered by phase |
| `saveResponse(experimentId, participantId, phaseId, stimulusId, responseData, responseIndex)` | Append-only INSERT |
| `uploadFile(bucket, path, file, contentType, experimentId)` | Upload audio to Storage (validates type, size, path) |

### `src/lib/server/admin.ts` — Admin-Facing

| Function | Purpose |
|----------|---------|
| `getAdminUser(userId)` | Verify user is in `admin_users` table |
| `listExperiments()` | All experiments + participant counts per experiment |
| `getExperiment(id)` | Single experiment by ID |
| `createExperiment(slug, config)` | INSERT with status 'draft' |
| `updateExperiment(id, { config?, status?, slug? })` | UPDATE selected fields + `updated_at` |
| `deleteExperiment(id)` | DELETE experiment (cascades to participants/responses) |
| `getParticipants(experimentId)` | Participants + response counts per participant |
| `getResponseData(experimentId)` | All rows from `response_flat` view for CSV export |

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

### Security Headers (set in `hooks.server.ts` on every response)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: {SUPABASE_URL};
  media-src 'self' blob: {SUPABASE_URL};
  connect-src 'self' {SUPABASE_URL};
  frame-ancestors 'none'
```

### File Upload Validation (`src/lib/server/data.ts`)

- **Allowed types**: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`
- **Max size**: 50MB
- **Path traversal protection**: Strips `..` and `//`, validates path starts with `audio/{experimentId}/`

### Response Data

- Responses are **append-only** (no UPDATE RLS policy)
- Each save creates a new row with incrementing `response_index`
- CSV export sanitizes values against injection (leading `=`, `+`, `-`, `@`, `\t`, `\r`)

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

---

## 15. What Is Left To Do

### Phase 5: Deployment + Migration
- **Deploy to Vercel**: Configure env vars, test production build, set up custom domain
- **Migrate existing data**: Import data from original Google Sheets experiment into Supabase
- **Test with real participants**: End-to-end testing at scale

### Known Gaps
- **`slider` widget**: Defined in schema, no rendering in `WidgetRenderer.svelte`
- **`multiselect` widget**: Same — schema only, no UI
- **`random-per-participant` ordering**: In schema, but client only implements `sequential` and `random` (random re-randomizes on each page load, not per-participant)
- **No test suite**: No unit, integration, or E2E tests exist
- **No pagination**: Experiment list, participants list, CSV export all load everything at once
- **Legacy endpoints**: `src/routes/e/[slug]/survey/{save,upload}` are duplicates of `[phaseSlug]` endpoints
- **Config editor coverage**: Some config sections may not be fully exposed in Form mode (tutorial editing, per-phase introduction, stimuli drag-and-drop)
- **a11y warnings**: Some labels not associated with controls in ConfigEditor (non-blocking)

### Potential Future Features
- Experiment duplication (clone config with new slug)
- Real-time participant monitoring dashboard
- Stimuli management UI (upload, reorder, preview, drag-and-drop)
- More widget types (image annotation, ranking, matrix)
- Experiment versioning (track config changes over time)
- Bulk participant operations (delete, re-open completed phases)
- inter-rater reliability calculations
- Multi-experiment aggregation views

---

## 16. Running the Project

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

## 17. File Quick Reference

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
| Database migrations | `supabase/migrations/001-005_*.sql` |
| Example experiment config | `configs/movement-onomatopoeia.json` |
| DB seeding script | `scripts/seed.js` |
