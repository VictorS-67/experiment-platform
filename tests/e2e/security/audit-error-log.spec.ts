import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * S5 — audit log rows exist for admin-facing mutations.
 * S6 — error log picks up unhandled 500s.
 *
 * This spec performs a compact set of audited actions (config save,
 * collaborator invite + role-change + remove, participant delete,
 * experiment delete) and asserts each shows up in admin_audit_log.
 * Then it triggers a 500 and asserts error_log captures it.
 */

test.describe('S5 audit log coverage', () => {
	test('each audited admin action writes a matching admin_audit_log row', async ({ page, ctx }) => {
		test.setTimeout(90_000);
		const cfg = makeFullFeatureConfig(`s5-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: seeded.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});

		// Second admin for collaborator actions.
		const other = await ctx.supabase.auth.admin.createUser({
			email: `s5-other-${Date.now()}@example.com`,
			password: `pw-${Date.now()}`,
			email_confirm: true
		});
		await ctx.supabase.from('admin_users').insert({ user_id: other.data.user!.id, role: 'admin' });

		await loginAsAdmin(page, ctx);

		// --- config.save via form action ---
		const updatedCfg = { ...cfg, version: 2 };
		const saveRes = await page.request.post(
			`/admin/experiments/${seeded.id}/config?/saveConfig`,
			{
				form: { config: JSON.stringify(updatedCfg), expectedUpdatedAt: '' },
				headers: { Origin: 'http://localhost:5173' }
			}
		);
		expect(saveRes.status()).toBeLessThan(400);

		// --- experiment.status_change ---
		const statusRes = await page.request.post(
			`/admin/experiments/${seeded.id}/settings?/updateStatus`,
			{ form: { status: 'active' }, headers: { Origin: 'http://localhost:5173' } }
		);
		expect(statusRes.status()).toBeLessThan(400);

		// --- collaborator.added (invite an existing admin → added directly) ---
		const inviteRes = await page.request.post(
			`/admin/experiments/${seeded.id}/settings?/invite`,
			{
				form: { email: other.data.user!.email!, role: 'editor' },
				headers: { Origin: 'http://localhost:5173' }
			}
		);
		expect(inviteRes.status()).toBeLessThan(400);

		// --- collaborator.role_change ---
		const roleRes = await page.request.post(
			`/admin/experiments/${seeded.id}/settings?/setRole`,
			{
				form: { userId: other.data.user!.id, role: 'viewer' },
				headers: { Origin: 'http://localhost:5173' }
			}
		);
		expect(roleRes.status()).toBeLessThan(400);

		// --- collaborator.remove ---
		const removeRes = await page.request.post(
			`/admin/experiments/${seeded.id}/settings?/remove`,
			{
				form: { userId: other.data.user!.id },
				headers: { Origin: 'http://localhost:5173' }
			}
		);
		expect(removeRes.status()).toBeLessThan(400);

		// --- participant.delete ---
		const { data: p } = await ctx.supabase
			.from('participants')
			.insert({
				experiment_id: seeded.id,
				email: `s5-p-${Date.now()}@example.com`,
				registration_data: {},
				session_token: crypto.randomUUID()
			})
			.select('id')
			.single();
		const delP = await page.request.post(
			`/admin/experiments/${seeded.id}/participants/${p!.id}?/delete`,
			{ form: {}, headers: { Origin: 'http://localhost:5173' } }
		);
		expect(delP.status()).toBeLessThan(400);

		// --- experiment.delete ---
		const delExp = await page.request.post(
			`/admin/experiments/${seeded.id}/settings?/delete`,
			{ form: {}, headers: { Origin: 'http://localhost:5173' } }
		);
		expect(delExp.status()).toBeLessThan(400);

		// Inspect audit log for the required action names.
		const { data: rows } = await ctx.supabase
			.from('admin_audit_log')
			.select('action, admin_user_id, admin_email, experiment_id')
			.eq('admin_user_id', ctx.adminUserId)
			.order('created_at', { ascending: false });
		const actions = new Set((rows ?? []).map((r) => r.action));
		const required = [
			'config.save',
			'experiment.status_change',
			'collaborator.added',
			'collaborator.role_change',
			'collaborator.remove',
			'participant.delete',
			'experiment.delete'
		];
		const missing = required.filter((a) => !actions.has(a));
		expect(missing, `missing audit actions: ${missing.join(',')}`).toEqual([]);

		// Each row should carry admin_user_id + admin_email.
		for (const row of rows!) {
			expect(row.admin_user_id).toBeTruthy();
			expect(row.admin_email).toBeTruthy();
		}

		await ctx.supabase.from('admin_users').delete().eq('user_id', other.data.user!.id);
		await ctx.supabase.auth.admin.deleteUser(other.data.user!.id);
	});
});

test.describe('S6 error log', () => {
	test('a 500 response from a route handler writes a row to error_log', async ({ page, ctx }) => {
		await loginAsAdmin(page, ctx);
		const before = (
			await ctx.supabase.from('error_log').select('id', { count: 'exact', head: true })
		).count ?? 0;

		// Feed the save endpoint a UUID that isn't an experiment — triggers
		// a server throw from requireExperimentAccess → handleError → error_log.
		const fakeId = crypto.randomUUID();
		const res = await page.request.post(
			`/admin/experiments/${fakeId}/config?/saveConfig`,
			{
				form: { config: '{"malformed": true}', expectedUpdatedAt: '' },
				headers: { Origin: 'http://localhost:5173' }
			}
		);
		// Likely 404 from requireExperimentAccess; we don't care which 4xx/5xx
		// code surfaces here, only that the error pipeline writes a row.
		expect(res.status()).toBeGreaterThanOrEqual(400);

		// If the route cleanly returns a 4xx without throwing, handleError
		// isn't called and error_log won't have a row. Try a more definitive
		// crash-path: ask the error endpoint to throw directly by calling a
		// non-existent form action.
		await page.request.post(
			`/admin/experiments/${fakeId}/settings?/doesNotExist`,
			{ form: {}, headers: { Origin: 'http://localhost:5173' } }
		);

		await page.waitForTimeout(500);
		const { count: after } = await ctx.supabase
			.from('error_log')
			.select('id', { count: 'exact', head: true });
		// At least one new row should have been written. If zero, the error
		// pipeline isn't writing; flag as a soft failure below.
		const delta = (after ?? 0) - before;
		if (delta < 1) {
			// If the platform only logs server throws and not 404 returns,
			// we fail loudly rather than silently passing — that's the bug
			// the playbook is asking about.
			expect(delta, 'error_log should have a new row after a 500/404 admin request').toBeGreaterThanOrEqual(1);
		}
		expect(delta).toBeGreaterThanOrEqual(1);
	});
});
