# CLAUDE.md

Config-driven experiment/survey platform for academic research. SvelteKit 5 + Supabase + Tailwind + Zod. One deployment serves unlimited experiments defined by JSON configs.

## Coding Philosophy

**Root-cause fixes, not band-aids.** When a bug surfaces, find the underlying cause and fix it there, even if the fix touches more files than the symptom. Avoid quick patches — special-case branches, suppressed warnings, `if this weird input then ...` guards — that mask the real problem and accumulate as scar tissue. If the proper fix is genuinely too large for the current change, document the trade-off explicitly in the commit message or a `# TODO:` rather than papering over it silently.

## Quick Commands

```bash
npm run dev          # Dev server → http://localhost:5173/
npm run build        # Production build
npm run check        # svelte-check (type errors)
npm run test         # Vitest (unit + server-handler tests)
npm run test:e2e     # Playwright E2E (requires local Supabase running)
node scripts/seed.js # Seed experiment config into DB
```

## Running E2E tests locally

```bash
supabase start                          # starts Postgres + GoTrue + Storage in Docker
eval "$(supabase status -o env)"        # exports API_URL, ANON_KEY, SERVICE_ROLE_KEY
# .env.local takes precedence over .env in Vite — the dev server picks this up
cat > .env.local <<EOF
PUBLIC_SUPABASE_URL=$API_URL
PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
EOF
# Restart any running `npm run dev` — env is cached at boot
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
4. **Run headed when iterating.** `npx playwright test --headed --slowmo=200` for exploration; CI can run headless. If a page renders weirdly, you need to actually see it.
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
