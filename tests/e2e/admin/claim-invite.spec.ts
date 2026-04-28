import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * A6.8 — Claim invite end-to-end. The owner invites a stranger by email,
 * the stranger then signs up (we simulate via service-role createUser), and
 * on their first login `claimInvitesForUser` auto-promotes them to an admin
 * and a collaborator on the inviting experiment. Their pending_invite row is
 * marked claimed_at.
 */

test.describe('A6.8 claim invite', () => {
	test('stranger login → auto-added as collaborator, pending_invite marked claimed', async ({
		page,
		ctx
	}) => {
		// Owner seeds an experiment and makes themselves the sole owner.
		const cfg = makeFullFeatureConfig(`a68-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: seeded.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});

		// Owner invites a stranger (no existing Supabase Auth user).
		const strangerEmail = `a68-stranger-${Date.now()}@example.com`;
		await loginAsAdmin(page, ctx);
		const inviteRes = await page.request.post(
			`/admin/experiments/${seeded.id}/settings?/invite`,
			{ form: { email: strangerEmail, role: 'editor' }, headers: { Origin: 'http://localhost:5173' } }
		);
		expect(inviteRes.status()).toBeLessThan(400);

		// Verify pending_invite was created.
		const { data: invite } = await ctx.supabase
			.from('pending_invites')
			.select('id, claim_token, claimed_at')
			.eq('experiment_id', seeded.id)
			.eq('email', strangerEmail)
			.single();
		expect(invite).not.toBeNull();
		expect(invite!.claimed_at).toBeNull();

		// Simulate the stranger completing Supabase Auth signup. The invite
		// flow already called `inviteUserByEmail`, which creates an unconfirmed
		// auth user. We finish the signup here by setting a password and
		// confirming the email via the service-role client.
		const strangerPassword = `pw-${Date.now()}`;
		const { data: list } = await ctx.supabase.auth.admin.listUsers({ perPage: 1000 });
		const existingUser = list.users.find((u) => (u.email ?? '').toLowerCase() === strangerEmail);
		let strangerUserId: string;
		if (existingUser) {
			await ctx.supabase.auth.admin.updateUserById(existingUser.id, {
				password: strangerPassword,
				email_confirm: true
			});
			strangerUserId = existingUser.id;
		} else {
			const { data: created } = await ctx.supabase.auth.admin.createUser({
				email: strangerEmail,
				password: strangerPassword,
				email_confirm: true
			});
			if (!created?.user) throw new Error('Failed to create stranger auth user');
			strangerUserId = created.user.id;
		}

		// Now the stranger logs in via the real form.
		const strangerCtx = await page.context().browser()!.newContext();
		const strangerPage = await strangerCtx.newPage();
		await strangerPage.goto('/admin/login');
		await strangerPage.getByLabel(/email/i).fill(strangerEmail);
		await strangerPage.getByLabel(/password/i).fill(strangerPassword);
		await strangerPage.getByRole('button', { name: /sign in/i }).click();
		await strangerPage.waitForURL(/\/admin\/experiments/);

		// On their first login, claimInvitesForUser should have promoted them:
		//  - admin_users row created (or upserted) so the admin-access check passes
		//  - experiment_collaborators row with the invited role
		//  - pending_invite.claimed_at set
		const { data: adminRow } = await ctx.supabase
			.from('admin_users')
			.select('user_id')
			.eq('user_id', strangerUserId)
			.single();
		expect(adminRow).not.toBeNull();

		const { data: collab } = await ctx.supabase
			.from('experiment_collaborators')
			.select('role')
			.eq('experiment_id', seeded.id)
			.eq('user_id', strangerUserId)
			.single();
		expect(collab).not.toBeNull();
		expect(collab!.role).toBe('editor');

		const { data: inviteAfter } = await ctx.supabase
			.from('pending_invites')
			.select('claimed_at')
			.eq('id', invite!.id)
			.single();
		expect(inviteAfter!.claimed_at).not.toBeNull();

		// The stranger's experiment list should show this experiment.
		await strangerPage.goto('/admin/experiments');
		await expect(strangerPage.getByRole('row', { name: new RegExp(seeded.slug, 'i') })).toBeVisible();

		await strangerCtx.close();
		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
		await ctx.supabase.from('admin_users').delete().eq('user_id', strangerUserId);
		await ctx.supabase.auth.admin.deleteUser(strangerUserId);
	});
});
