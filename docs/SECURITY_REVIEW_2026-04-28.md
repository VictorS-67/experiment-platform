# Security Review — 2026-04-28

Pre-push security review of the changes on `main` (1 commit ahead of `origin/main` plus uncommitted working-tree changes). Three high-confidence vulnerabilities identified. **Fix before pushing.**

---

## Vuln 1: Privilege Escalation — `/admin/backup` accessible to any invited collaborator

* **File:** [src/routes/admin/backup/+server.ts:7-47](../src/routes/admin/backup/+server.ts#L7-L47)
* **Severity:** High
* **Category:** authorization_bypass / privilege_escalation
* **Confidence:** 9/10

### Description

`/admin/backup` only checks `if (!locals.adminUser) error(401)` — no role gate, no per-experiment scoping. It dumps every row from `experiments`, `participants` (including `email` and `registration_data` PII) and `responses` across the **entire deployment**.

In combination with the new invite-claim flow at [src/lib/server/collaborators.ts:336-339](../src/lib/server/collaborators.ts#L336-L339), where `claimInvitesForUser` unconditionally upserts `admin_users(user_id, role='researcher')` for any user who claims any invite (including `viewer`-role invites), being invited to a single experiment as a viewer silently grants a platform-wide `admin_users` row.

The hooks middleware at [src/hooks.server.ts:165-181](../src/hooks.server.ts#L165-L181) accepts any `admin_users` row regardless of role, so the attacker passes the `/admin/*` gate.

### Exploit Scenario

1. Owner of Experiment A invites `attacker@x.com` as `viewer` (the lowest invite role).
2. Attacker accepts the Supabase Auth invite and signs in once.
3. `claimInvitesForUser` creates an `admin_users` row for them with role `researcher`.
4. Attacker `GET /admin/backup` and streams a JSON dump of every participant email, registration data, and response across **every experiment on the platform** — including experiments they have zero collaborator access on.

### Recommendation

Either:

- **(a)** Restrict `/admin/backup` to a true platform-level role (e.g. `if (locals.adminUser.role !== 'admin')`) and ensure invite-claim does not auto-grant that role; or
- **(b)** Scope the export to only experiments the caller has owner/editor on — use `listAccessibleExperimentIds(locals.adminUser.id)` and filter each `paginate()` call by `experiment_id`.

Independently, do not auto-create `admin_users` rows from `claimInvitesForUser`. Collaborator membership should not imply platform admin status.

---

## Vuln 2: IDOR — Cross-experiment participant deletion

* **File:** [src/lib/server/admin.ts:329-334](../src/lib/server/admin.ts#L329-L334)
* **Caller:** [src/routes/admin/experiments/\[id\]/data/+page.server.ts:30-41](../src/routes/admin/experiments/[id]/data/+page.server.ts#L30-L41)
* **Severity:** High
* **Category:** insecure_direct_object_reference / authorization_bypass
* **Confidence:** 9/10

### Description

The `bulkDelete` action gates on `requireExperimentAccess(locals.adminUser, params.id, 'editor')` and then calls `deleteParticipants(participantIds)` with IDs taken straight from form data. The helper issues:

```ts
from('participants').delete().in('id', participantIds)
```

…with **no `experiment_id` filter** — and runs under the service-role key, bypassing RLS. The same defect applies to `deleteParticipant` (singular) and `resetParticipantResponses` in the same file.

By contrast, the read helper `getParticipantDetail` correctly scopes by `experiment_id` to avoid IDOR, confirming the maintainers know the threat model — but the same scoping is missing on these write paths.

### Exploit Scenario

1. Mallory holds editor on Experiment B (her own study) and viewer on Experiment A (a colleague's).
2. She loads `/admin/experiments/A/data` and copies participant UUIDs (legitimate read).
3. She POSTs to `/admin/experiments/B/data?/bulkDelete` with `participantIds=<A's UUIDs>`.
4. The action verifies she's editor on B, then deletes the A rows. Cascading FK deletes wipe their `responses`.
5. A's owner sees data vanish; the `admin_audit_log` entry, if any, references B — not A — so attribution is broken.

A weaker variant: any editor anywhere who learns a single UUID via a logged URL or screenshot can destroy that row across the whole platform.

### Recommendation

Add an `experimentId` parameter to `deleteParticipants`, `deleteParticipant`, and `resetParticipantResponses`, and append `.eq('experiment_id', experimentId)` to the query. Have callers pass `params.id`. Optionally, pre-fetch the rows constrained to the experiment and only operate on the intersection.

---

## Vuln 3: Cross-experiment storage enumeration / participant PII metadata leak

* **File:** [src/routes/admin/experiments/\[id\]/storage-check/+server.ts:6-36](../src/routes/admin/experiments/[id]/storage-check/+server.ts#L6-L36)
* **Severity:** Medium-High
* **Category:** authorization_bypass / information_disclosure
* **Confidence:** 8/10

### Description

The endpoint requires only `viewer` access on `params.id` but takes a `path` query parameter and forwards it directly to `supabase.storage.from('experiments').list(listPath, ...)` after stripping a leading `experiments/` prefix.

There is no check that `listPath` is rooted under the experiment's own prefix (`stimuli/<slug>/…` or `audio/<params.id>/…`).

The `experiments` bucket also stores participant audio uploads at `audio/<experimentId>/<participantId>/<stimulusId>/<widgetId>_<timestamp>.<ext>` (per [src/routes/e/\[slug\]/\[phaseSlug\]/upload/+server.ts:38](../src/routes/e/[slug]/[phaseSlug]/upload/+server.ts#L38)).

### Exploit Scenario

Mallory has viewer access on any one experiment.

1. She calls `/admin/experiments/<her-exp>/storage-check?path=audio/` to enumerate every other experiment ID with audio uploads.
2. She drills down with `?path=audio/<other-exp-id>/` to enumerate participant UUIDs.
3. She drills further with `?path=audio/<other-exp-id>/<participantId>/` to enumerate the stimuli that participant responded to and the upload timestamps.

This breaks the per-experiment RBAC boundary that CLAUDE.md explicitly establishes ("Admins are not granted access to all experiments").

If audio paths within the `experiments` bucket are publicly readable (the bucket already serves `stimuli/...` via public URLs in `StimulusRenderer.svelte`), the leaked filenames are directly downloadable as voice recordings — biometric PII.

### Recommendation

- Resolve the experiment's allowed prefixes from `params.id` (e.g. `stimuli/<exp.slug>/` and `audio/<params.id>/`) and require the resolved `listPath` to start with one of them; reject anything else with 400/403.
- Reject any segment containing `..` or a leading `/`.
- Verify whether the audio sub-tree of the `experiments` bucket is public-read. If so, switch audio to a private bucket served via signed URLs.

---

## Defense-in-depth (not exploitable, but worth fixing)

### `revokeInvite` doesn't scope by experiment

* **File:** [src/lib/server/collaborators.ts:297-308](../src/lib/server/collaborators.ts#L297-L308)
* **Caller:** [src/routes/admin/experiments/\[id\]/settings/+page.server.ts:153-166](../src/routes/admin/experiments/[id]/settings/+page.server.ts#L153-L166)

`revokePendingInvite(inviteId)` deletes by `id` only. Owner-of-A could revoke an invite belonging to experiment B if they knew the invite UUID. Dismissed as unexploitable because invite UUIDs are unguessable and not leaked across experiments via any listing endpoint or the claim URL (which uses a separate `claim_token`). Still worth fixing for defense-in-depth and audit-log integrity:

```ts
revokePendingInvite(experimentId, inviteId)
  // ...
  .eq('experiment_id', experimentId)
  .eq('id', inviteId)
```

---

## Summary

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | `/admin/backup` accessible to any invited collaborator | High | `src/routes/admin/backup/+server.ts` |
| 2 | `bulkDelete` / `deleteParticipant` / `resetParticipantResponses` not scoped by `experiment_id` | High | `src/lib/server/admin.ts` |
| 3 | `storage-check` allows arbitrary path enumeration in the `experiments` bucket | Medium-High | `src/routes/admin/experiments/[id]/storage-check/+server.ts` |
| — | `revokeInvite` not scoped by `experiment_id` (defense-in-depth) | Low | `src/lib/server/collaborators.ts` |

All three High/Medium-High findings share a root cause: **service-role helpers that trust the caller's per-experiment authorization gate but don't re-bind their own SQL/storage queries to that experiment.** The fix pattern is uniform — pass `experimentId` into the helper and add the matching `.eq('experiment_id', experimentId)` predicate.
