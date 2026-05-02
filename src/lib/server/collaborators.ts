import { error } from '@sveltejs/kit';
import { getServerSupabase } from './supabase';
import { unwrap, unwrapVoid } from './db';

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

const ROLE_RANK: Record<CollaboratorRole, number> = {
	viewer: 1,
	editor: 2,
	owner: 3
};

export interface Collaborator {
	userId: string;
	email: string;
	role: CollaboratorRole;
	addedAt: string;
	/** Email of the admin who first added this collaborator (or null if the
	 *  inviter's auth row no longer exists). */
	addedByEmail: string | null;
}

export interface PendingInvite {
	id: string;
	email: string;
	role: CollaboratorRole;
	claimToken: string;
	invitedAt: string;
	expiresAt: string;
	/** Email of the admin who issued the invite (or null if their auth row
	 *  has been deleted since). */
	invitedByEmail: string | null;
}

/**
 * Returns the role this admin has on this experiment, or null if none.
 * Service-role query — bypasses RLS.
 */
export async function getCollaboratorRole(
	adminUserId: string,
	experimentId: string
): Promise<CollaboratorRole | null> {
	const supabase = getServerSupabase();
	const { data } = await supabase
		.from('experiment_collaborators')
		.select('role')
		.eq('experiment_id', experimentId)
		.eq('user_id', adminUserId)
		.maybeSingle();
	return (data?.role as CollaboratorRole | undefined) ?? null;
}

/**
 * Throws a 401/403/404 unless the admin has at least minRole on the experiment.
 * Returns the actual role they hold (≥ minRole) for downstream use.
 *
 * Use this in every admin loader/action that touches a specific experiment.
 */
export async function requireExperimentAccess(
	adminUser: { id: string } | null,
	experimentId: string,
	minRole: CollaboratorRole
): Promise<CollaboratorRole> {
	if (!adminUser) error(401, 'Unauthorized');
	const role = await getCollaboratorRole(adminUser.id, experimentId);
	if (!role) error(404, 'Experiment not found');
	if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
		error(403, `This action requires ${minRole} access; you have ${role}.`);
	}
	return role;
}

/** List the experiment IDs this admin can access at any role. */
export async function listAccessibleExperimentIds(adminUserId: string): Promise<string[]> {
	const supabase = getServerSupabase();
	const data = unwrap(
		await supabase
			.from('experiment_collaborators')
			.select('experiment_id')
			.eq('user_id', adminUserId),
		'Failed to list accessible experiments'
	);
	return data.map((r) => r.experiment_id as string);
}

/** All collaborators on an experiment, joined with auth.users for email
 *  (theirs AND the inviter's, for the "Invited by" column). */
export async function listCollaborators(experimentId: string): Promise<Collaborator[]> {
	const supabase = getServerSupabase();
	const data = unwrap(
		await supabase
			.from('experiment_collaborators')
			.select('user_id, role, added_at, added_by')
			.eq('experiment_id', experimentId)
			.order('added_at', { ascending: true }),
		'Failed to list collaborators'
	);
	if (!data.length) return [];

	const userIds = data.map((r) => r.user_id as string);
	// supabase.auth.admin.listUsers() returns a discriminated union (different
	// `data` shape on error) that doesn't satisfy unwrap's `T | null` contract.
	const { data: users, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
	if (usersErr) {
		console.error('Failed to load auth users:', usersErr);
		throw new Error('Failed to load auth users');
	}
	const emailById = new Map(users.users.map((u) => [u.id, u.email ?? '']));

	return data
		.filter((r) => userIds.includes(r.user_id as string))
		.map((r) => ({
			userId: r.user_id as string,
			email: emailById.get(r.user_id as string) ?? '(unknown)',
			role: r.role as CollaboratorRole,
			addedAt: r.added_at as string,
			addedByEmail: r.added_by ? emailById.get(r.added_by as string) ?? null : null
		}));
}

/** Pending (unclaimed, unexpired) invites for an experiment. Joins
 *  `invited_by` against auth.users to expose the inviter's email. */
export async function listPendingInvites(experimentId: string): Promise<PendingInvite[]> {
	const supabase = getServerSupabase();
	const data = unwrap(
		await supabase
			.from('pending_invites')
			.select('id, email, role, claim_token, invited_at, expires_at, invited_by')
			.eq('experiment_id', experimentId)
			.is('claimed_at', null)
			.gt('expires_at', new Date().toISOString())
			.order('invited_at', { ascending: false }),
		'Failed to list pending invites'
	);
	if (!data.length) return [];

	// Separate listUsers call from listCollaborators — the SDK does not
	// cache HTTP responses, so this is a real second round-trip on every
	// settings-page load. Acceptable at current scale (tens of admins) and
	// kept as separate calls so the two listings can run in parallel from
	// the page loader.
	const { data: users, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
	if (usersErr) {
		console.error('Failed to load auth users:', usersErr);
		throw new Error('Failed to load auth users');
	}
	const emailById = new Map(users.users.map((u) => [u.id, u.email ?? '']));

	return data.map((r) => ({
		id: r.id as string,
		email: r.email as string,
		role: r.role as CollaboratorRole,
		claimToken: r.claim_token as string,
		invitedAt: r.invited_at as string,
		expiresAt: r.expires_at as string,
		invitedByEmail: r.invited_by ? emailById.get(r.invited_by as string) ?? null : null
	}));
}

export class LastOwnerError extends Error {
	constructor() {
		super('Cannot remove the last owner of this experiment.');
		this.name = 'LastOwnerError';
	}
}

export async function setCollaboratorRole(
	experimentId: string,
	userId: string,
	role: CollaboratorRole
): Promise<void> {
	const supabase = getServerSupabase();
	const { error: dbErr } = await supabase
		.from('experiment_collaborators')
		.update({ role })
		.eq('experiment_id', experimentId)
		.eq('user_id', userId);
	if (dbErr) {
		if ((dbErr as { code?: string }).code === 'P0005') throw new LastOwnerError();
		console.error('Failed to update collaborator role:', dbErr);
		throw new Error('Failed to update collaborator role');
	}
}

export async function removeCollaborator(experimentId: string, userId: string): Promise<void> {
	const supabase = getServerSupabase();
	const { error: dbErr } = await supabase
		.from('experiment_collaborators')
		.delete()
		.eq('experiment_id', experimentId)
		.eq('user_id', userId);
	if (dbErr) {
		if ((dbErr as { code?: string }).code === 'P0005') throw new LastOwnerError();
		console.error('Failed to remove collaborator:', dbErr);
		throw new Error('Failed to remove collaborator');
	}
}

/** Idempotent: returns the existing row if already a collaborator. */
export async function addCollaboratorByUserId(
	experimentId: string,
	userId: string,
	role: CollaboratorRole,
	addedBy: string
): Promise<void> {
	const supabase = getServerSupabase();
	unwrapVoid(
		await supabase
			.from('experiment_collaborators')
			.upsert(
				{ experiment_id: experimentId, user_id: userId, role, added_by: addedBy },
				{ onConflict: 'experiment_id,user_id' }
			),
		'Failed to add collaborator'
	);
}

const INVITE_TTL_DAYS = 14;

export interface InviteOutcome {
	kind: 'added' | 'invited';
	/** Set when kind === 'invited'; the URL to claim the invite (always usable;
	 *  also shown alongside the email send result so admins can copy/paste). */
	claimUrl?: string;
	/** True if Supabase Auth email was sent successfully. False/undefined when
	 *  we couldn't send (no SMTP configured, rate-limited, etc.). When false,
	 *  the invitee can use the platform's Forgot Password link to set their
	 *  password once email delivery resumes; if SMTP is hard-broken, an admin
	 *  must use the Supabase Dashboard manually (see SECURITY.md). */
	emailSent?: boolean;
	emailError?: string;
}

/**
 * Invite by email. If the email already exists in Supabase Auth AND has an
 * `admin_users` row, add them directly as a collaborator. Otherwise create a
 * pending invite, attempt to send a Supabase Auth invitation email, and
 * always return a claim URL the admin can share manually.
 */
export async function inviteCollaboratorByEmail(
	experimentId: string,
	rawEmail: string,
	role: CollaboratorRole,
	invitedBy: string,
	origin: string
): Promise<InviteOutcome> {
	const email = rawEmail.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new Error('Invalid email address');
	}

	const supabase = getServerSupabase();

	// Look up existing auth user.
	// `getUserByEmail` doesn't exist on the JS SDK; list and filter instead.
	const { data: usersList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
	const existingUser = usersList.users.find((u) => (u.email ?? '').toLowerCase() === email);

	if (existingUser) {
		const { data: adminRow } = await supabase
			.from('admin_users')
			.select('user_id')
			.eq('user_id', existingUser.id)
			.maybeSingle();

		if (adminRow) {
			// Direct add — they're already a known admin.
			await addCollaboratorByUserId(experimentId, existingUser.id, role, invitedBy);
			return { kind: 'added' };
		}
	}

	// Create / refresh pending invite. UNIQUE(experiment_id, email) means we
	// upsert: if there's already an unclaimed invite for this pair, we update
	// its role + token + expiry rather than fail.
	const claimToken = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

	unwrapVoid(
		await supabase.from('pending_invites').upsert(
			{
				experiment_id: experimentId,
				email,
				role,
				claim_token: claimToken,
				invited_by: invitedBy,
				invited_at: new Date().toISOString(),
				expires_at: expiresAt,
				claimed_at: null
			},
			{ onConflict: 'experiment_id,email' }
		),
		'Failed to create pending invite'
	);

	const claimUrl = `${origin}/admin/login?claim=${encodeURIComponent(claimToken)}`;

	// Best-effort email send via Supabase Auth. If SMTP isn't configured this
	// will fail or be rate-limited — that's fine, the admin can still copy the
	// claim URL.
	let emailSent: boolean | undefined;
	let emailError: string | undefined;
	try {
		const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
			redirectTo: claimUrl
		});
		if (inviteErr) {
			emailSent = false;
			emailError = inviteErr.message;
			console.warn('Auth invite email failed (admin can still share claim URL):', inviteErr.message);
		} else {
			emailSent = true;
		}
	} catch (err) {
		emailSent = false;
		emailError = err instanceof Error ? err.message : 'Unknown error';
	}

	// Note: we deliberately do NOT generate a Supabase password-recovery URL
	// to surface to the inviting admin on SMTP failure. Doing so would let
	// any owner take over the auth identity of any non-admin email by
	// inviting it — see SECURITY.md "Invite-flow privilege boundary" for
	// the full attack chain. The invitee uses the platform's Forgot Password
	// page to set a password once email recovers; if SMTP is hard-broken,
	// see SECURITY.md "Recovering when email is unavailable" for the manual
	// Supabase Dashboard procedure.

	return { kind: 'invited', claimUrl, emailSent, emailError };
}

/** Re-emit the Supabase Auth invite email for an existing pending invite,
 *  refreshing the OTP without invalidating the platform's claim_token (so
 *  any link the admin already shared keeps working). Also bumps expires_at
 *  by another full TTL window so the row doesn't auto-expire mid-flow. */
export async function resendPendingInvite(
	experimentId: string,
	inviteId: string,
	origin: string
): Promise<{ emailSent: boolean; emailError?: string; email: string; claimUrl: string }> {
	const supabase = getServerSupabase();

	const { data: invite } = await supabase
		.from('pending_invites')
		.select('email, claim_token')
		.eq('id', inviteId)
		.eq('experiment_id', experimentId)
		.is('claimed_at', null)
		.maybeSingle();
	if (!invite) throw new Error('Pending invite not found or already claimed.');

	const email = invite.email as string;
	const claimToken = invite.claim_token as string;
	const claimUrl = `${origin}/admin/login?claim=${encodeURIComponent(claimToken)}`;
	const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

	// Refresh the platform-side TTL window so the row doesn't expire during
	// whatever delay this resend is meant to recover from.
	unwrapVoid(
		await supabase
			.from('pending_invites')
			.update({ expires_at: expiresAt })
			.eq('id', inviteId)
			.eq('experiment_id', experimentId),
		'Failed to refresh invite expiry'
	);

	let emailSent = false;
	let emailError: string | undefined;
	try {
		const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
			redirectTo: claimUrl
		});
		if (inviteErr) {
			emailError = inviteErr.message;
			console.warn('Resend email failed:', inviteErr.message);
		} else {
			emailSent = true;
		}
	} catch (err) {
		emailError = err instanceof Error ? err.message : 'Unknown error';
	}

	// As in inviteCollaboratorByEmail: no recovery-URL fallback. Forgot
	// Password is the legitimate recovery path for the invitee; manual
	// Dashboard intervention covers the SMTP-hard-broken case.
	return { emailSent, emailError, email, claimUrl };
}

export async function revokePendingInvite(experimentId: string, inviteId: string): Promise<void> {
	// Scope by experimentId in addition to inviteId so an owner of A can never
	// revoke an invite belonging to B even with a leaked invite UUID. Defense
	// in depth — the listing endpoints don't expose cross-experiment invite
	// UUIDs today, but binding the query to the gate's experiment closes the
	// gap unconditionally.
	const supabase = getServerSupabase();

	// Capture email + role BEFORE the delete so we can decide whether to
	// also clean up the orphaned Supabase Auth user.
	const { data: invite } = await supabase
		.from('pending_invites')
		.select('email')
		.eq('id', inviteId)
		.eq('experiment_id', experimentId)
		.is('claimed_at', null)
		.maybeSingle();

	unwrapVoid(
		await supabase
			.from('pending_invites')
			.delete()
			.eq('id', inviteId)
			.eq('experiment_id', experimentId)
			.is('claimed_at', null),
		'Failed to revoke invite'
	);

	if (!invite) return; // nothing to clean up — invite was already gone

	// Cleanup of the orphaned Supabase Auth user. `inviteUserByEmail` creates
	// an auth.users row at invite time; that row outlives a revoked
	// pending_invites row by default and blocks the email from ever being
	// re-invited cleanly (the next inviteUserByEmail returns "already
	// registered"). We delete it ONLY when it's safe:
	//   - No OTHER pending invites for this email (someone else might still
	//     need this auth row to land them on a working invite link).
	//   - No `admin_users` row for this user (they've never actually logged
	//     in — if they had, they'd be a real admin we shouldn't nuke).
	// All three conditions failing → keep the auth row, the platform stays
	// in a consistent state.
	const email = invite.email as string;

	const { data: otherInvites } = await supabase
		.from('pending_invites')
		.select('id')
		.eq('email', email)
		.is('claimed_at', null)
		.limit(1);
	if (otherInvites?.length) return;

	// Find the auth user by email (no direct lookup API — list + filter).
	const { data: usersList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
	const authUser = usersList.users.find((u) => (u.email ?? '').toLowerCase() === email);
	if (!authUser) return;

	const { data: adminRow } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', authUser.id)
		.maybeSingle();
	if (adminRow) return; // real admin somewhere — keep them

	// Best-effort delete. If it fails (RLS, permissions, etc.) we log and
	// continue — the revoke itself already succeeded; this is cleanup.
	const { error: delErr } = await supabase.auth.admin.deleteUser(authUser.id);
	if (delErr) {
		console.warn('Failed to delete orphaned auth user after revoke:', delErr.message);
	}
}

/**
 * Claim every pending invite that matches this email. Called from the admin
 * login flow once an admin's identity is verified. Idempotent — safe to call
 * on every login.
 *
 * Side effect: if the user isn't yet in `admin_users`, they're added with the
 * `researcher` role so they can actually log into /admin and see the
 * experiments they were invited to.
 */
export async function claimInvitesForUser(userId: string, email: string): Promise<number> {
	const supabase = getServerSupabase();
	const lower = email.trim().toLowerCase();

	const { data: invites, error: selErr } = await supabase
		.from('pending_invites')
		.select('id, experiment_id, role')
		.eq('email', lower)
		.is('claimed_at', null)
		.gt('expires_at', new Date().toISOString());

	if (selErr) {
		console.error('Failed to look up pending invites:', selErr);
		return 0;
	}
	if (!invites?.length) return 0;

	// Make sure the user has an admin_users row.
	await supabase
		.from('admin_users')
		.upsert({ user_id: userId, role: 'researcher' }, { onConflict: 'user_id' });

	const nowIso = new Date().toISOString();
	let claimed = 0;
	for (const inv of invites) {
		try {
			await addCollaboratorByUserId(
				inv.experiment_id as string,
				userId,
				inv.role as CollaboratorRole,
				userId
			);
			await supabase.from('pending_invites').update({ claimed_at: nowIso }).eq('id', inv.id);
			claimed++;
		} catch (err) {
			console.error('Failed to claim invite', inv.id, err);
		}
	}
	return claimed;
}
