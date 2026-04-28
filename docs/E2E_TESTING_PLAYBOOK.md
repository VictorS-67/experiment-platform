# E2E Testing Playbook

> **For a Claude Code session with access to a Chromium browser via Playwright.**
> Your mission: exercise every moving part of the experiment platform end to end, surface bugs, and report findings. Assume zero prior context beyond this document and the repo contents.

## 0. Ground rules — how to test

You are auditing **behavior under real conditions** — real browser, real Postgres, real Supabase Auth. Unit tests already cover algorithmic correctness; your job is to catch the bugs that only show up when a human uses the app.

**Test like a real admin or a real participant would.** This is the single most important rule. The previous session ran the whole suite programmatically (HTTP + selector-fills + service-role DB queries) and missed almost every surface that matters — tutorial overlays, phase transitions, config editor previews, review-phase UX. Don't repeat that.

Concretely:

1. **Run Playwright headed, with slowmo.** Default every interactive spec to `await page.pause()`-able configuration. When iterating by hand, use:
   ```bash
   npx playwright test --headed --slowmo=200
   ```
   Automated CI can run headless, but while you're *exploring* the app, you must actually watch the browser. If a page renders weirdly, you need to see it.

2. **Navigate like a human, not like a script.** Prefer clicking visible nav links over `page.goto('/admin/…')`. Prefer filling fields by their on-screen label over testids. If the real admin would land on the experiments list first and then click through, your test does the same — that way "the nav is broken" is a bug you'll catch, not silently skip.

3. **Verify through the UI, not the DB.** Setup and teardown may use the service-role client (it's faster and it's how you get deterministic state). But *assertions* that a feature works must read the same thing a user would: the list page, the toast, the rendered value. If you want to assert "the experiment was created," open the list and see it — don't just `SELECT * FROM experiments`. The DB check is a nice-to-have on top; it is not a substitute.

4. **Cover everything a real admin (or participant) could actually do.** Don't stop at the happy path for each feature; think about what an admin *would reasonably try* — rename something, hit Cancel halfway, reload mid-edit, paste malformed JSON into the config editor, invite themselves, try to remove the last owner, open the same experiment in two tabs. The playbook sections (P/A/S/M/R) are a checklist of surfaces, not an exhaustive list of cases — if a surface has obvious user-facing variations, test them.

5. **No videos, no screenshots required.** A clear written description of what you observed (and what went wrong, if it did) is enough evidence. Don't spend time attaching media; spend time testing more.

**Reporting format.** As you work, keep a running file at `docs/E2E_REPORT_<YYYY-MM-DD>.md` with one row per test you ran:

| ID | Feature | Result | Notes |
|---|---|---|---|
| P1.1 | Participant register, new email | ✅ | Landed on phase 1, session cookie set, DB row present. |
| C2.3 | Invite existing admin as editor | ❌ | Invite row created but role column stayed blank until hard refresh. |

Don't invent successes. If you can't run something, mark it `⏸ blocked` and say why. A pass means you observed the expected state *in the browser*; DB/log checks are supporting evidence only.

Every time you find a bug, write in the report:
- The reproduction steps (exact clicks/inputs, not "I clicked around")
- What you expected vs. what actually happened
- Which file you think owns the bug (grep the repo — don't guess)
- If small and obvious, fix it in the same session; otherwise leave a ❌ row with a remediation direction.

---

## 1. Prereqs & bring-up

> ⚠ **HARD STOP — safety gate.** The `.env` at the repo root points the dev
> server at whichever Supabase project the repo owner develops against. If
> that's a **hosted** project (URL ends in `.supabase.co`), you MUST NOT run
> this playbook until you've switched the dev server over to a local stack.
> The suite creates, mutates, and deletes rows using the service role; it
> will wreck production data.

**Step 1 — verify you're not about to smoke prod:**

```bash
grep '^PUBLIC_SUPABASE_URL=' .env 2>/dev/null
```

If you see `supabase.co` (hosted), stop and follow "Step 1a — swap to local Supabase" below. If you see `localhost` / `127.0.0.1`, skip to Step 2.

**Step 1a — swap to local Supabase** (the `.env.local` file takes precedence over `.env` in Vite; it's gitignored):

```bash
supabase start                               # Docker required; first run pulls images
npx playwright install chromium --with-deps
eval "$(supabase status -o env)"
cat > .env.local <<EOF
PUBLIC_SUPABASE_URL=$API_URL
PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
EOF
```

Then **restart any running `npm run dev`** — it caches the old env on boot.

**Step 2 — export the same vars into your current shell** (Playwright's fixture reads these; the safety guard in `tests/e2e/fixtures.ts` hard-fails if the URL isn't local):

```bash
export PUBLIC_SUPABASE_URL="$API_URL"
export PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
```

**Step 3 — prove the dev server is connected to local Supabase** before running a single test:

```bash
npm run dev &                                 # if not already running
sleep 3
curl -s http://localhost:5173/ -o /dev/null    # warm it up
# Hit any admin login page and watch the network tab / server log — the
# POST to supabase should go to 127.0.0.1:54321, NOT *.supabase.co. If you
# see a hosted URL, kill `npm run dev`, confirm .env.local exists + contains
# the local URL, and restart.
```

**Sanity check the stack**:
```bash
psql "$DB_URL" -c "\dt public.*"             # expect experiments, participants, responses, experiment_collaborators, pending_invites, admin_audit_log, error_log, rate_limits, + aggregate views
```
If you see fewer than **20 migrations applied**, run `supabase db reset` and try again.

**Run the existing suite first**:
```bash
npm run test:e2e
```
This boots `npm run dev` (port 5173) and runs `tests/e2e/*.spec.ts`. Expected: all 3 spec files pass. Any failure here means the selectors drifted from the admin UI — **fix the spec, don't skip**.

**Create a seed fixture** for participant tests (you'll need this for most P-series tests below). Write this helper as `tests/e2e/seed.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

export async function seedExperiment(config: Record<string, unknown>, opts: { status?: 'active' | 'draft' } = {}) {
  const supabase = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.from('experiments')
    .insert({ slug: config.slug, config, status: opts.status ?? 'active' })
    .select('id').single();
  if (error) throw error;
  return { id: data.id as string, slug: config.slug as string };
}
```

Import this from every P-series spec. Never hand-insert via psql — tests should be self-seeding so they're deterministic.

---

## 2. Feature matrix

Work through each section in order. Each test ID is what you'll use in the report table.

### P — Participant-facing flow

Seed **one experiment** covering the widest feature surface (chunking + tutorial + review phase + multiple widget types + skip/branch rules + conditional registration fields). Dump the config you use into `tests/e2e/fixtures/full-feature-config.json` so future agents can re-seed the same baseline.

**P1 — Registration**

- [ ] P1.1: Fresh email + all required fields → lands on first phase URL. DB: participant row created, `session_token` cookie set, `registration_data` JSONB matches form input.
- [ ] P1.2: Missing required field → form shows inline error, no participant row created.
- [ ] P1.3: Conditional field (e.g., `native_language` visible only when `country == 'jp'`) appears/disappears based on the controlling select.
- [ ] P1.4: Returning same email → `{found:true}` response, cookie re-issued, user lands back where they left off (or on `nextChunkUrl` if chunking is enabled).
- [ ] P1.5: Email with caps / whitespace is normalized to lowercase + trim.

**P2 — Session rotation (F5)**

- [ ] P2.1: Log in, note `session_token` cookie value. Force `last_rotated_at` backwards (see below), reload the phase page. Cookie value changes. DB `participants.last_rotated_at` advanced to now.
  ```sql
  -- run via psql against the local DB
  UPDATE participants SET last_rotated_at = NOW() - INTERVAL '25 hours' WHERE email = 'your-test-email';
  ```
- [ ] P2.2: Same setup but POST to `/save` instead of GET — token is NOT rotated (rotation only on GET by design), but POST succeeds because old token still matches.
- [ ] P2.3: Delete the participant row while session cookie is held → next request logs them out cleanly.

**P3 — Phase traversal & widgets**

- [ ] P3.1: Stimulus-response phase, each widget type, submit happy path. Verify `responses.response_data` JSONB shape matches config widget IDs.
- [ ] P3.2: Required widgets missing → save blocked with user-visible error. No response row inserted.
- [ ] P3.3: `allowMultipleResponses=true` → two submissions for same stimulus both stored, `response_index` increments.
- [ ] P3.4: `allowRevisit=false` → attempting to revisit a completed stimulus is blocked.
- [ ] P3.5: Gatekeeper question "No" with `skipToNext=true` → widgets hidden, advances to next stimulus, stored `response_data` contains `noResponseValue`.
- [ ] P3.6: Conditional widget visibility (`conditionalOn: {widgetId, value}`) — widget shows only when dependency matches.

**P4 — Skip rules & branch rules**

- [ ] P4.1: `skipRule.targetStimulusId=s2` fires when `s1.w1 == 'no'` → stimulus s2 never appears in the nav.
- [ ] P4.2: `branchRule` directs user to a non-sequential phase when condition is met.
- [ ] P4.3: Multiple branch rules — first match wins, fallback is sequential.

**P5 — Review phase (the response-UUID-as-stimulusId gotcha)**

- [ ] P5.1: Complete a stimulus-response phase with 3 responses, then enter a review phase whose `sourcePhase` points at it. Review phase should iterate **response UUIDs** from the source phase (not stimulus IDs).
- [ ] P5.2: Submit a review response. DB: `responses.stimulus_id` contains the source response UUID (not a stimulus ID from `config.stimuli.items`). This is the H6 bug surface — confirm the real handler does NOT validate against stimulus-items here.
- [ ] P5.3: `filterEmpty=true` → responses with all-null answers from the source phase are hidden.

**P6 — Chunking**

- [ ] P6.1: `blockOrder: 'latin-square'` with 4 blocks → participants 1-4 see 4 different rotations. Verify via 4 separate participant sessions.
- [ ] P6.2: `blockOrder: 'random-per-participant'` → same seed produces same order (open two tabs, same participant, same block sequence).
- [ ] P6.3: `withinBlockOrder: 'random'` → fresh random per page load (different order on reload with same participant).
- [ ] P6.4: Break screen with countdown → "Continue" button disabled until countdown hits 0; seeing this requires the browser to remain focused during the countdown.
- [ ] P6.5: `minBreakMinutes=5` + completing a chunk → next-chunk URL shows a countdown until `canStartAt`; trying to go earlier bounces to the break page.
- [ ] P6.6: Race: open two tabs, complete the same chunk in both simultaneously. DB: `chunk_assignments.<slug>` is written exactly once (migration 009 RPC) with no lost updates.

**P7 — Tutorial**

- [ ] P7.1: First visit with `config.tutorial != null` → tutorial overlay appears before the main phase.
- [ ] P7.2: Step with `validation: { type: 'click', target: '#foo' }` → "Next" button disabled until user clicks `#foo`.
- [ ] P7.3: `allowSkip=true` → skip button visible; clicking it goes straight to first phase.
- [ ] P7.4: Tutorial completion persists — reload after finishing, tutorial does NOT reappear.

**P8 — Completion & feedback**

- [ ] P8.1: Complete all phases → completion page renders with `config.completion.title/body`.
- [ ] P8.2: Feedback widgets submit → stored in `responses` with a distinguishing `phase_id` (check how the app does this; may be `__completion` or similar).
- [ ] P8.3: `redirectUrl` honored after feedback submission.

**P9 — i18n**

- [ ] P9.1: Language switcher flips all localized strings in the UI.
- [ ] P9.2: Choice persists to `localStorage` under `experiment-platform.language`; reload keeps it.
- [ ] P9.3: `<html lang>` attribute reflects current language (check via `document.documentElement.lang` in devtools).
- [ ] P9.4: Config with `"jn"` keys (pre-migration legacy) — migrator fixed this; re-run `npx tsx scripts/migrate-configs.ts` and verify it reports "0 already valid, 0 migrated, no failures" on a freshly-seeded config.

### A — Admin flow

**A1 — Auth**

- [ ] A1.1: Login with valid creds → lands on `/admin/experiments`, sets `admin_access_token` + `admin_refresh_token` cookies (refresh token maxAge = 14 days per F6).
- [ ] A1.2: Wrong password → 403 error message, no cookies set.
- [ ] A1.3: No `admin_users` row for a valid Supabase Auth user → login fails with "You do not have admin access."
- [ ] A1.4: Logout clears both cookies AND calls Supabase signOut (network tab should show the request).
- [ ] A1.5: Access-token expiry → next request auto-refreshes and rotates the refresh token (check cookie value changes).

**A2 — Experiment CRUD**

- [ ] A2.1: Create → DB has new experiment, `created_by = locals.adminUser.id`, `experiment_collaborators` row auto-inserted with role `owner` (trigger from migration 015).
- [ ] A2.2: Duplicate an existing experiment → new row with `-copy` suffix, all config cloned, creator becomes sole owner on the copy.
- [ ] A2.3: Delete → only allowed if you're an `owner`; participants + responses cascade-deleted. Audit log row with `action = 'experiment.delete'`.
- [ ] A2.4: List page only shows experiments the current admin collaborates on (not every experiment).

**A3 — Config editor**

- [ ] A3.1: Form mode edit → Save → DB `experiments.config` updated, new row in `experiment_config_versions` (migration 014 atomic RPC).
- [ ] A3.2: JSON mode with invalid JSON → save blocked with parse error.
- [ ] A3.3: JSON mode with invalid schema (e.g., likert widget missing min) → server returns Zod error list.
- [ ] A3.4: **Optimistic lock**: open the config editor in two tabs, save in tab A, then save in tab B → tab B gets a 409 "Config was modified by another admin..." (via the P0004 Postgres error code).
- [ ] A3.5: Form→JSON switch serializes form state into JSON; JSON→Form parses JSON back. Edits in JSON are reflected in Form after the round trip.
- [ ] A3.6: `beforeNavigate` guard: navigate away with unsaved changes → browser confirm dialog.
- [ ] A3.7: Save button pulse indicator (`●`) present only when unsaved changes exist.

**A4 — Version history**

- [ ] A4.1: Versions page lists every save ordered descending.
- [ ] A4.2: Rollback → latest config matches the picked version; a new version row is also created (rollback-as-new-version pattern).
- [ ] A4.3: Rollback fails loudly if the old config no longer validates under the current schema.

**A5 — Participant management & data**

- [ ] A5.1: Data page loads chunk progress + stats + participants list. Counts come from DB views (migration 020) — verify by checking network tab has no massive per-row payloads.
- [ ] A5.2: Bulk delete selected participants → removed from DB; audit log row per batch or per participant (confirm which; adjust if unclear).
- [ ] A5.3: CSV export raw → downloaded file has one row per (participant × phase × stimulus). Open and spot-check with a recent participant.
- [ ] A5.4: CSV export research → one row per (participant × stimulus × response_index), phase columns merged side-by-side, stimulus metadata expanded to `stimulus_<key>` columns.
- [ ] A5.5: JSON export alternative → same shape, valid JSON.
- [ ] A5.6: Include Registration toggle → adds `reg_<field>` columns / keys.
- [ ] A5.7: Human-readable dates toggle → timestamps formatted differently from ISO.
- [ ] A5.8: **Participant IDOR**: try visiting `/admin/experiments/<EXP-A>/participants/<PID-FROM-EXP-B>` (copy an ID from a different experiment's data page). Expect 404, NOT the participant's data.

**A6 — Collaborators (Phase C)**

- [ ] A6.1: Settings → Collaborators shows the creator as owner, `(you)` marker.
- [ ] A6.2: Invite an email that belongs to an existing `admin_users` user → they're added directly; appears in the collaborators table.
- [ ] A6.3: Invite an unknown email → pending-invite row + a `?claim=<uuid>` link surfaced in the success banner + a "Copy link" button on the Pending invites row.
- [ ] A6.4: Change role via the dropdown → DB `experiment_collaborators.role` updated, audit log `collaborator.role_change`.
- [ ] A6.5: Remove collaborator → row deleted, audit log `collaborator.remove`.
- [ ] A6.6: **Last owner invariant**: if you're the only owner, attempt to (a) demote yourself or (b) remove yourself → both should fail with the `P0005` error from migration 015's trigger, visible as an inline error.
- [ ] A6.7: Revoke pending invite → removed from the list.
- [ ] A6.8: Claim an invite: log out, navigate to the claim link → login page. Log in as the invited email (create a Supabase Auth user for that email first via service-role client; simulates `inviteUserByEmail` having sent a signup link). After login: collaborators panel shows them; `pending_invites.claimed_at` is set.

**A7 — Access control matrix**

Create three admins: owner-admin, editor-admin, viewer-admin, plus a non-collaborator. For each role, walk through every admin page/action below. Expected access per role:

| Action | viewer | editor | owner |
|---|---|---|---|
| List experiments (sees this one) | ✅ | ✅ | ✅ |
| View config | ✅ | ✅ | ✅ |
| Save config | 403 | ✅ | ✅ |
| Rollback version | 403 | ✅ | ✅ |
| Change status | 403 | ✅ | ✅ |
| Export CSV/JSON | 403 | ✅ | ✅ |
| Delete participant | 403 | ✅ | ✅ |
| Invite collaborator | 403 | 403 | ✅ |
| Change collaborator role | 403 | 403 | ✅ |
| Delete experiment | 403 | 403 | ✅ |

A non-collaborator: every experiment-scoped URL returns 404 (not 403 — we hide existence). Confirm.

**A8 — Bulk stimulus import**

- [ ] A8.1: Storage mode — paste a Supabase storage path, click "Check storage", see file list. Pick subset. Apply filename pattern like `{emotion}-{actor}.mp4` — preview shows extracted metadata. Import → config.stimuli.items grows; schema validation blocks invalid items (surfaced in the modal, not silent).
- [ ] A8.2: CSV mode — paste filename,metadata-key,metadata-value rows. Import only picks rows where filename matches an existing storage file.
- [ ] A8.3: Schema rejection path — craft an item with a non-string metadata value (e.g., nested object); confirm the modal shows it in the "Skipped X invalid item(s)" summary and does NOT import it.

### S — Security / infrastructure

**S1 — CSP (production build)**

Run `npm run build && npm run preview` and hit the preview URL. Open devtools → Console. Any CSP violation reports?

- [ ] S1.1: Every `<script>` in the HTML response has a `nonce=...` attribute matching the `Content-Security-Policy` header on the same response.
- [ ] S1.2: `script-src` does NOT contain `'unsafe-inline'`.
- [ ] S1.3: `style-src-elem` does NOT contain `'unsafe-inline'`.
- [ ] S1.4: `style-src-attr 'unsafe-inline'` IS present (we scoped the leniency narrowly).
- [ ] S1.5: Participant flow (progress bars, video playback) works without CSP violations. Same for admin UI (collaborators panel, config editor, modals).

**S2 — Rate limiter (Postgres-backed, migration 016)**

- [ ] S2.1: Hammer `/e/<slug>/auth` with 21 POSTs in under a minute (curl loop). Last one gets 429.
- [ ] S2.2: DB: `SELECT * FROM rate_limits WHERE ip = '<your ip>' AND endpoint = '/auth'` shows a row with `count >= 20`.
- [ ] S2.3: Restart the dev server → limits still enforced (they're in Postgres, not in-memory).

**S3 — CSRF origin check**

- [ ] S3.1: In dev, POST to `/e/<slug>/auth` with an Origin header set to `https://evil.example` → 403 "Cross-origin request blocked".
- [ ] S3.2: In dev, POST with no Origin header → allowed (dev tolerance for curl/Postman).
- [ ] S3.3: Same request with matching Origin → allowed.

**S4 — HSTS + security headers**

Production build only: `preview` responses should include:
- [ ] S4.1: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- [ ] S4.2: `X-Frame-Options: DENY`
- [ ] S4.3: `X-Content-Type-Options: nosniff`
- [ ] S4.4: `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] S4.5: `Permissions-Policy: camera=(), microphone=(self), geolocation=()`

Dev should skip HSTS (check it's absent when NODE_ENV=development).

**S5 — Audit log (migration 017)**

After running the whole A-series and P-series, query:
```sql
SELECT action, COUNT(*) FROM admin_audit_log GROUP BY action ORDER BY 2 DESC;
```

- [ ] S5.1: Expected actions present: `config.save`, `experiment.status_change`, `experiment.delete`, `participant.reset_responses`, `participant.delete`, `collaborator.added`, `collaborator.invited`, `collaborator.role_change`, `collaborator.remove`, `invite.revoke`, `backup.export_all`.
- [ ] S5.2: Each row has `admin_user_id`, `admin_email`, `ip`, `experiment_id` (where applicable).

**S6 — Error log (migration 019)**

- [ ] S6.1: Trigger a 500 deliberately (e.g., break a route temporarily or POST malformed JSON that slips past validation). Verify a row in `error_log` with the stack trace, URL, method.
- [ ] S6.2: `SENTRY_DSN` set but bogus → `reportError` fails silently to console, does NOT block the request. (Simulate by setting `SENTRY_DSN=https://bogus@sentry.io/123`.)

### M — Schema migrator

- [ ] M1: Seed a config with a `"jn"` typo and a likert widget without min/max. Run `npx tsx scripts/migrate-configs.ts` (dry run) — it should report both issues and the auto-fixes.
- [ ] M2: Run with `--write` → DB updated; re-running gives "2 already valid, 0 migrated".

### R — Race conditions (migrations 009, 010, 014)

These need programmatic drivers because browsers won't fire them reliably. Use the service-role Supabase client in a tiny Node script.

- [ ] R1: 10 concurrent `saveChunkAssignment` calls for same participant + chunk → exactly one row survives, no "last write wins" loss. Verify the RPC was called (not the old read-modify-write) by tailing Postgres logs.
- [ ] R2: 10 concurrent `insert_config_version` → `version_number` values are 1..10 exactly, no duplicates, no gaps (note: current impl uses MAX+1 in a plpgsql function which CAN still deadlock; if you see a failure here it's a real issue).
- [ ] R3: `upsert_config_with_version` with an `expected_updated_at` that matches → succeeds. Same RPC with a stale `expected_updated_at` → raises `P0004`, caller gets `ConfigConflictError`.

---

## 3. Expanding the Playwright suite

As you run each test above, add the ones that are worth automating to `tests/e2e/`. Group by area:

```
tests/e2e/
  fixtures.ts         (already exists)
  seed.ts             (create this — helper from §1)
  participant/
    registration.spec.ts
    widgets.spec.ts
    review.spec.ts
    chunking.spec.ts
    tutorial.spec.ts
    i18n.spec.ts
  admin/
    auth.spec.ts
    crud.spec.ts
    config-editor.spec.ts
    optimistic-lock.spec.ts
    data-export.spec.ts
    collaborators.spec.ts
    access-control.spec.ts
    bulk-import.spec.ts
  security/
    csp.spec.ts
    rate-limit.spec.ts
    csrf.spec.ts
    headers.spec.ts
  race/
    chunk-assignment.spec.ts
    config-version.spec.ts
```

Don't try to automate everything in one sitting. Prioritize:
1. **Anything that found a bug** — add a regression test the moment you fix it.
2. **Anything that's easy to automate** — most P-series and A-series tests.
3. **Defer**: race conditions (R-series; keep as scripts in `scripts/race-*.ts`), tutorial (needs Driver.js shadow-DOM selectors, fiddly), audio recording (browser permissions).

Run the full suite before stopping: `npm run test:e2e`. It must be green.

---

## 4. Finishing up

When you're done (or hit the end of your runway):

1. Commit new specs + the seeded `tests/e2e/fixtures/full-feature-config.json` in a single commit.
2. Update `docs/E2E_REPORT_<DATE>.md` with final counts: N tests run, X passed, Y failed, Z blocked.
3. For each `❌ failed` row: ensure either (a) there's a commit that fixes it, or (b) there's a new entry in `docs/AUDIT_REMEDIATION_PLAN.md` or a GitHub issue with the repro.
4. Leave the next session a short "where I stopped" paragraph at the top of the report.

## 5. Reference: credentials & entry points

- **Admin login**: `/admin/login` — use credentials from `.credentials` (gitignored) if they exist, else create one via the service-role client:
  ```ts
  const { data: { user } } = await supabase.auth.admin.createUser({ email: 'you@test.local', password: '...', email_confirm: true });
  await supabase.from('admin_users').insert({ user_id: user.id, role: 'admin' });
  ```
- **Participant entry**: `/e/<slug>` — slug from the seeded experiment.
- **Supabase Studio**: `http://localhost:54323` — for eyeballing rows.
- **Supabase Inbucket** (captures outgoing Auth emails): `http://localhost:54324` — invite claim links land here in local mode.
- **CLAUDE.md** at the repo root — binding constraints on patterns (e.g., `update({ reset: false })`, `{@const}` placement). Honor them when you write new specs.
