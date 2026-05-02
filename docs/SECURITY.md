# Security

## Security Headers (set in `hooks.server.ts`)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload   # production only
```

### Content Security Policy

Configured via `kit.csp` in `svelte.config.js` (mode `'auto'`). SvelteKit injects a per-response `nonce` into every framework `<script>` tag and sets the matching `Content-Security-Policy` header.

```
default-src 'self';
script-src 'self' 'nonce-<random>';                 # nonce-bound, no unsafe-inline
style-src 'self' https://fonts.googleapis.com;      # strict, NO unsafe-inline
style-src-attr 'unsafe-inline';                     # narrow exception for Tailwind v4 inline styles
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: {SUPABASE_URL};
media-src 'self' blob: {SUPABASE_URL};
connect-src 'self' {SUPABASE_URL};
frame-ancestors 'none'
```

`unsafe-inline` was removed from both `script-src` and `style-src`. `style-src-attr 'unsafe-inline'` is the narrow exception kept for Tailwind v4's per-element inline styles. Inline event handlers (`onclick=""`) and inline `<style>` blocks are blocked.

**`{SUPABASE_URL}` resolution**: `svelte.config.js` uses Vite's `loadEnv(mode, cwd)` to read the active env file before the config object is constructed. This means `--mode local-db` correctly whitelists `http://127.0.0.1:54321` in `media-src` and `connect-src` for local development. Without `loadEnv`, `process.env.PUBLIC_SUPABASE_URL` is evaluated before Vite processes mode-specific env files, so the local URL was never included and the browser blocked all storage requests.

## File Upload Validation

- **Allowed types**: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`
- **Max size**: 50MB (Content-Length pre-check + actual size check)
- **Magic byte detection**: Server validates file signatures (OGG, WebM, MP4, MP3) before upload
- **Path traversal protection**: Iterative sanitization removing `..` and `//`; IDs validated against `/^[a-zA-Z0-9_.-]+$/`

## Rate Limiting (Postgres-backed)

`checkRateLimit(ip, endpoint, max, windowSeconds)` from `$lib/server/rate-limit` calls the `rate_limit_check` RPC (migration 016). Sliding-window per-(IP, endpoint).

| Endpoint | Limit |
|----------|-------|
| `/auth` | 20 / min |
| `/save` | 60 / min |
| `/upload` | 30 / min |

- Survives serverless cold starts (state lives in Postgres, not module memory).
- Stale rows are cleaned by the `cleanup_rate_limits()` function — schedule it via `pg_cron` or hit it from a periodic admin endpoint.
- Returns 429 when exceeded.

## CSRF Protection

- SvelteKit form actions have built-in CSRF protection.
- API endpoints verify `Origin` header on POST/PUT/DELETE.
- Production blocks empty `Origin` headers; dev allows them for tooling convenience.

## Authorization

### Participant sessions
- UUID `session_token` in httpOnly cookie (90-day maxAge).
- Fresh token generated on every login via `rotateSessionToken()`.
- 24h time-based rotation via `last_rotated_at` (migration 018).
- DB expiry: tokens inactive >90 days are rejected.

### Admin sessions
- Supabase Auth JWTs in httpOnly cookies, verified + refreshed in `hooks.server.ts`.
- Membership in `admin_users` table required for any admin route access.
- **Cookie lifetimes**: access token 1h (matches JWT lifetime), refresh token 14d. Supabase rotates the refresh token on each successful refresh; old tokens are invalidated by the server.

### Per-experiment collaborators
- `experiment_collaborators(experiment_id, user_id, role)` with role ∈ {owner, editor, viewer}.
- Every admin route guards its experiment via `requireExperimentAccess(locals.adminUser, experimentId, minRole)` from `$lib/server/collaborators`.
- Non-collaborators get **404** (not 403) — hide existence rather than leak it.
- Owners can invite by email through `pending_invites`; claim happens at next login via `claimInvitesForUser`.
- Owner-invariant trigger blocks demoting/removing the last owner of an experiment (migrations 015 + 021).
- Revoking a pending invite also deletes the orphaned `auth.users` row when safe (no other pending invites for the email AND no `admin_users` row), so a re-invite for the same email starts cleanly.

## Pre-deploy Supabase Auth configuration

For every Supabase project the platform deploys against (local, staging, prod), verify **Auth → URL Configuration** in the Supabase dashboard before launching:

1. **Site URL** = production hostname (no trailing slash). The default `http://localhost:3000` ends up in invite emails as the body text "You have been invited to create a user on …" — embarrassing on prod and confusing for invitees.
2. **Redirect URLs** allowlist must include `${SITE_URL}/admin/**` (production), plus `http://localhost:5173/admin/**` for local dev. Without the allowlist entry, `supabase.auth.admin.inviteUserByEmail({ redirectTo })` silently falls back to Site URL and the invite-claim flow appears broken to the invitee. The same applies to `supabase.auth.resetPasswordForEmail({ redirectTo })`.
3. (Optional, for prod) Custom SMTP. Free-tier built-in mailer is rate-limited to ~3-4 emails/hour and may land in spam — fine for ≤5 collaborators per experiment, painful beyond that.

## Invite-flow privilege boundary

The collaborator-invite flow deliberately does NOT surface a server-generated Supabase password-recovery URL to the inviting admin when SMTP fails. This is a security trade-off, not an oversight.

Earlier iterations did surface a `recoveryUrl` (returned by `supabase.auth.admin.generateLink({ type: 'recovery', email })`) so the admin could share both a "set password" and an "accept invite" link out-of-band when the built-in mailer was rate-limited. That gave any owner of any experiment a privilege-escalation primitive:

1. Owner-attacker invites `victim@example.com` to their own experiment.
2. Owner-attacker spams a few invites to burn the free-tier email rate limit (3-4/hour).
3. Subsequent invites return `recoveryUrl` (no email needed).
4. Owner-attacker uses the recovery URL to set a new password on victim's `auth.users` row — created by `inviteUserByEmail` even when email-send fails.
5. Owner-attacker logs in as victim. Their `claimInvitesForUser` runs and grants victim an `admin_users` row.
6. Any later invite of victim's email by another owner falls into the "added directly" branch (existing-admin shortcut) — granting owner-attacker access to that other experiment via victim's identity.

The hole affected any email NOT yet in `admin_users` (existing admins were protected by the `if (existingUser && adminRow) return { kind: 'added' }` short-circuit). To close it, the recovery-URL fallback was removed entirely. The legitimate recovery paths are:

- **Invitee-driven**: when SMTP recovers (e.g. rate limit clears in an hour), invitee opens the claim URL → sees the "you've been invited" banner → clicks **Forgot password?** → enters their email → receives a reset link → sets password → returns to login → invite claims automatically.
- **Admin-driven (no SMTP at all)**: see "Recovering when email is unavailable" below.

When making changes to `inviteCollaboratorByEmail` or `resendPendingInvite`, do not re-introduce a server-generated recovery/magic link surfaced to the inviting admin. Any new invite-flow URL exposed to admins must be either (a) bound to the platform's own `claim_token` (no auth power) or (b) routed through email so only the recipient can use it.

## Recovering when email is unavailable

Both invite delivery (`inviteUserByEmail`) and password reset (`resetPasswordForEmail`) go through the same Supabase Auth mailer. If that mailer is hard-broken — custom SMTP misconfigured, project-wide block, free-tier rate limit you can't wait through — the platform has no in-app way to give an invitee or stuck collaborator a working credential.

Manual fallback (admin with Supabase project access required):

1. Open the Supabase Dashboard → **Authentication → Users**.
2. Find the affected email's row.
3. Click ⋯ → **Send invite** (for an unclaimed pending invite) or **Send password recovery** (for a collaborator who already has an account).
4. The Dashboard's email-send path is the same one the platform uses, so this only helps if the underlying issue was platform-side and not Supabase-side. If even the Dashboard can't send, the project's auth email is genuinely down — fix custom SMTP / wait for rate-limit reset / contact Supabase support.

This step is intentionally NOT exposed in the platform's UI: the same admin-Dashboard endpoint that triggers a manual recovery email is the same primitive that powers the security hole described above. Keeping it Dashboard-only means only project-level admins (a smaller, more trusted set than per-experiment owners) can issue out-of-band credential reset links.

## Optimistic Locking

Config saves and rollbacks pass `expected_updated_at` to the `upsert_config_with_version` RPC (migration 014). A mismatch raises `P0004`, surfaced as a 409 with the "modified by another admin" toast. Both `saveConfigWithVersion` AND `rollbackToVersion` plumb this through — restoring an old version requires the same lock as a normal save.

## Audit + Error Logging

- **Audit (`admin_audit_log`)**: Mutating admin actions write a row via `logAdminAction()` from `$lib/server/audit`. Append-only. The `experiment_id` FK is `ON DELETE SET NULL` so audit rows survive experiment deletion with `experiment_id = NULL`.
  - **Ordering rule**: in delete actions, call audit BEFORE the cascade delete. Inserting a child row that points at an already-deleted parent violates the FK at INSERT time (the SET NULL rule only fires when the parent is later deleted, not when inserting a dangling reference).
- **Error log (`error_log`)**: `reportError()` from `$lib/server/errors` writes to Postgres by default; the abstraction is Sentry-swappable. SvelteKit's `handleError` hook wires unhandled 500s into this path.

## Backup Endpoint

`/admin/backup` (GET) dumps **every** experiment's PII + responses across the platform. Restricted to `admin_users.role === 'admin'` only — the `researcher` role is auto-issued to every collaborator-invite claimer (see `claimInvitesForUser`), so the platform-wide gate must be stricter than "any admin_users row." Per-experiment researchers can pull their own data via the per-experiment CSV/JSON export at `/admin/experiments/[id]/data/export`.

Every call writes a `backup.export_all` row to `admin_audit_log`. The output is streamed via `ReadableStream` + the `paginate()` helper (`$lib/server/pagination`) so memory use stays bounded regardless of dataset size. The participant `session_token` column is **omitted** from the export — a leaked backup file should not be usable to hijack live sessions.

## Data Validation

- **Registration**: Server validates required fields against config schema (50KB max).
- **Responses**: Validates `phaseId`, `stimulusId` (except review phases), widget keys against config (100KB max).
- **XSS**: Tutorial overlay content escaped via `escapeHtml()` before HTML interpolation.
- **CSV export**: Values sanitized against formula injection (leading `=`, `+`, `-`, `@`, `\t`, `\r`).

## Error Messages

All server functions use generic public-facing messages. Raw Supabase/Postgres errors are logged server-side via `console.error()` only and never surfaced to the browser.

## Known follow-ups

- **Audio uploads share the public `experiments` Supabase Storage bucket** with stimuli (which are intentionally publicly readable for `<img>`/`<video>` `src=` access). The storage-check enumeration leak is closed (path-prefix gate), but if `audio/<experimentId>/<participantId>/...` paths are publicly downloadable, anyone who learns a path can fetch the recording. Mitigation: move audio to a private bucket (`audio-uploads` or similar) and serve via signed URLs from the admin participant-detail page. Not done yet because it touches the upload endpoint, the renderer that plays audio in admin review, and any external consumers (e.g. data-export downloads). Next high-priority security pass.

## E2E Test Safety Rail

`tests/e2e/fixtures.ts` checks `PUBLIC_SUPABASE_URL` against a local-only regex (`localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal`). The suite refuses to run against a hosted Supabase URL unless `E2E_ALLOW_REMOTE=yes-i-know-what-im-doing` is set. Prevents an accidental test run from scribbling on production data.
