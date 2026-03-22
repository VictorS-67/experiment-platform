# Experiment Platform

A config-driven web platform for running behavioral experiments and surveys. Define your entire experiment — registration, stimuli, response widgets, multi-phase workflows, tutorials — in a single JSON file. Deploy once, run unlimited experiments.

Built with **SvelteKit 5**, **Supabase**, and **Tailwind CSS**.

---

## Features

**For Participants**
- Email-based registration with configurable form fields (text, number, select, conditional visibility)
- Multi-phase experiments: stimulus-response phases + review phases
- Rich response widgets: text, textarea, likert scales, number inputs, sliders, dropdowns, multiselect, timestamp annotation, audio recording
- Gatekeeper questions (yes/no gate before showing widgets)
- Interactive tutorial with step-by-step overlay (Driver.js)
- Bilingual support (English / Japanese) with in-app language switcher
- Session persistence via httpOnly cookies — close the browser, come back later

**For Researchers (Admin Dashboard)**
- Create, edit, duplicate, and manage experiments from `/admin`
- Dual config editor: visual Form mode or raw JSON mode
- Zod schema validation with human-readable error messages on save
- Participant data table: view individual detail pages, reset or delete participants, bulk operations
- CSV export with two styles: raw (one row per phase response) and research-friendly (phases merged side-by-side, response_data keys expanded into columns)
- JSON export alternative; optional registration data columns; ISO or human-readable timestamps
- Stats panel: participants per phase, stimulus response distribution
- Experiment lifecycle management (draft → active → paused → archived)
- Config versioning: every save stored as a version, rollback to any previous config

**Architecture Highlights**
- Config-driven: everything renders from a validated JSON config stored as JSONB in Postgres
- All database writes are server-side only (service role key) — the browser never touches Supabase directly
- Row-Level Security policies tightened across 7 migrations
- Rate limiting (per-IP sliding window) and CSRF origin checking on all API endpoints
- DB errors never exposed to clients — generic messages surfaced, details logged server-side
- Environment variable validation at startup (fail-fast)
- Security headers: CSP, X-Frame-Options, Permissions-Policy, etc.

---

## Quick Start

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone and install

```bash
git clone <repo-url>
cd experiment-platform
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Set up the database

Run the SQL migrations in order against your Supabase project (via the SQL Editor in the Supabase dashboard or the Supabase CLI):

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_tighten_rls.sql
supabase/migrations/004_session_security.sql
supabase/migrations/005_remove_anon_select.sql
supabase/migrations/006_fix_view_security.sql
supabase/migrations/007_experiment_versions.sql
```

### 4. Create an admin user

1. Create a user in Supabase Auth (Dashboard → Authentication → Users → Add User)
2. Insert a row into the `admin_users` table:
   ```sql
   INSERT INTO admin_users (user_id, role) VALUES ('<user-uuid>', 'admin');
   ```

### 5. Seed an experiment (optional)

```bash
node scripts/seed.js
```

This upserts the config from `configs/movement-onomatopoeia.json` into the `experiments` table.

If your experiment uses video stimuli in Supabase Storage:
```bash
node scripts/upload-all-videos.js
```

### 6. Run

```bash
npm run dev
```

- Participant view: [http://localhost:5173/e/movement-onomatopoeia](http://localhost:5173/e/movement-onomatopoeia)
- Admin dashboard: [http://localhost:5173/admin](http://localhost:5173/admin)

---

## Project Structure

```
src/
├── hooks.server.ts              # Auth middleware + security headers
├── lib/
│   ├── config/schema.ts         # Zod schema — the source of truth for config shape
│   ├── i18n/                    # Internationalization (en, ja)
│   ├── server/                  # Server-only: Supabase client, data functions, admin functions
│   ├── stores/                  # Svelte 5 rune-based stores (experiment, participant, responses)
│   └── components/
│       ├── admin/               # Config editor, form sections
│       ├── layout/              # Header, modal, progress bar, stimulus nav
│       ├── registration/        # Dynamic registration form
│       ├── review/              # Review phase display + timestamp replay
│       ├── stimuli/             # Video player, stimulus renderer
│       ├── tutorial/            # Driver.js tutorial overlay
│       └── widgets/             # All response widget types + audio recorder
├── routes/
│   ├── admin/                   # Admin dashboard routes
│   └── e/[slug]/                # Participant-facing experiment routes
configs/                         # Example experiment JSON configs
scripts/                         # DB seeding + video upload scripts
supabase/migrations/             # 6 SQL migration files
```

---

## Stimulus Naming Convention

- **Existing experiments** (`movement-to-onomatopoeia`, `movement-description`): Stimulus items use numeric IDs (e.g., `"4"` → `4.mp4`) because response data already references these. Original filenames are stored in `metadata.originalName` for each stimulus item, with full mapping available in `previous_expe_data/{experiment}/{experiment}_Names.csv`.
- **New experiments**: Use the original filename (without extension) as both the stimulus `id` and `filename`. Example: `{ "id": "JP_01_contempt_1_M", "filename": "JP_01_contempt_1_M.mp4" }`.

---

## How It Works

### The Config

Each experiment is defined by a single JSON object. Here's the high-level structure:

```jsonc
{
  "slug": "my-experiment",
  "metadata": { "title": { "en": "My Study", "ja": "私の研究" }, "languages": ["en", "ja"] },
  "registration": { "fields": [/* email, name, age, etc. */] },
  "tutorial": { "steps": [/* Driver.js overlay steps */] },
  "phases": [
    {
      "type": "stimulus-response",
      "responseWidgets": [/* text, likert, timestamp-range, audio-recording, ... */],
      "gatekeeperQuestion": { "text": { "en": "Does this remind you of something?" } }
    },
    {
      "type": "review",
      "reviewConfig": { "sourcePhase": "phase-1", "responseWidgets": [/* review widgets */] }
    }
  ],
  "stimuli": { "type": "video", "source": "supabase-storage", "items": [/* 144 videos */] }
}
```

The full schema is defined in `src/lib/config/schema.ts` using Zod. The admin dashboard validates configs against this schema on every save.

See `configs/movement-onomatopoeia.json` for a complete real-world example.

### Participant Journey

1. Visit `/e/{slug}` → enter email
2. New users fill out a registration form → existing users resume their session
3. Optional tutorial with interactive overlay
4. Complete each phase: view stimulus → fill response widgets → save → next
5. Completion modal after each phase with navigation to the next

### Admin Dashboard

1. Log in at `/admin` with Supabase Auth credentials
2. Create or edit experiments via form-based or JSON config editor
3. View participant data and export CSV

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run check` | Run svelte-check (TypeScript + Svelte validation) |
| `node scripts/seed.js` | Seed experiment config into database |
| `node scripts/upload-all-videos.js` | Upload stimuli videos to Supabase Storage |

---

## Tech Stack

| | |
|---|---|
| **Framework** | [SvelteKit](https://svelte.dev/docs/kit) v2 with Svelte 5 (runes) |
| **Database** | [Supabase](https://supabase.com) (PostgreSQL + Auth + Storage) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com) v4 |
| **Validation** | [Zod](https://zod.dev) v4 |
| **Tutorial** | [Driver.js](https://driverjs.com) |
| **Language** | TypeScript (strict mode) |

---

## Deployment

The project uses `@sveltejs/adapter-vercel` for deployment on Vercel.

1. Push to a Git repository
2. Import in Vercel
3. Set the three environment variables (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
4. Deploy
5. Add the Vercel URL to Supabase Auth → URL Configuration → Redirect URLs (needed for admin login)

---

## License

Private project. All rights reserved.
