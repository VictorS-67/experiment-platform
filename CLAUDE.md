# CLAUDE.md

Config-driven experiment/survey platform for academic research. SvelteKit 5 + Supabase + Tailwind + Zod. One deployment serves unlimited experiments defined by JSON configs.

## Coding Philosophy

**Root-cause fixes, not band-aids.** When a bug surfaces, find the underlying cause and fix it there, even if the fix touches more files than the symptom. Avoid quick patches — special-case branches, suppressed warnings, `if this weird input then ...` guards — that mask the real problem and accumulate as scar tissue. If the proper fix is genuinely too large for the current change, document the trade-off explicitly in the commit message or a `# TODO:` rather than papering over it silently.

## Quick Commands

```bash
npm run dev          # Dev server → http://localhost:5173/
npm run build        # Production build
npm run check        # svelte-check (type errors)
npm run test         # Vitest (unit tests)
node scripts/seed.js # Seed experiment config into DB
```

## Architecture

- **Config-driven**: Experiment config (JSON → Zod → JSONB in Postgres) defines everything — registration, phases, stimuli, widgets, tutorials, completion
- **Two auth systems**: Participants use custom session tokens (httpOnly cookies); admins use Supabase Auth verified against `admin_users` table
- **Server-only mutations**: Browser never writes to Supabase directly. Anon key reads active experiment configs only; service role key handles all CRUD
- **Svelte 5 runes**: `$state` class stores in `.svelte.ts`, `$props()`, `$derived`/`$derived.by`, `$effect`, `$bindable`
- **Co-located tests**: `*.test.ts` files next to source (Vitest)
- **Migrations**: Sequential in `supabase/migrations/` (001-012)

## Key Files

| What | Where |
|------|-------|
| Config schema + types | `src/lib/config/schema.ts` |
| Auth middleware + security | `src/hooks.server.ts` |
| Participant data layer | `src/lib/server/data.ts` |
| Admin data layer | `src/lib/server/admin.ts` |
| Phase page (main survey UI) | `src/routes/e/[slug]/[phaseSlug]/+page.svelte` |
| Save endpoint | `src/routes/e/[slug]/[phaseSlug]/save/+server.ts` |
| Admin config editor | `src/lib/components/admin/ConfigEditor.svelte` |

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
