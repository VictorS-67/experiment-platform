import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * A7 — Access control matrix. Four admins (owner, editor, viewer, non-collab)
 * × every admin route and mutation. Non-collab should get 404 (hide
 * existence); viewers can read but not mutate; editors can mutate config /
 * participant data but not manage collaborators or delete the experiment.
 */

type Role = 'owner' | 'editor' | 'viewer' | 'nonCollab';

async function createAdmin(
	supabase: import('@supabase/supabase-js').SupabaseClient,
	suffix: string
) {
	const email = `e2e-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
	const password = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	const { data } = await supabase.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	await supabase.from('admin_users').insert({ user_id: data.user!.id, role: 'admin' });
	return { id: data.user!.id, email, password };
}

async function loginAs(
	page: import('@playwright/test').Page,
	creds: { email: string; password: string }
) {
	await page.goto('/admin/login');
	await page.getByLabel(/email/i).fill(creds.email);
	await page.getByLabel(/password/i).fill(creds.password);
	await page.getByRole('button', { name: /sign in/i }).click();
	await page.waitForURL(/\/admin\/experiments/);
}

test.describe('A7 access control matrix', () => {
	test('A7.1: route guards — owner/editor/viewer read, non-collab 404s', async ({ page, ctx }) => {
		test.setTimeout(90_000);
		// Seed experiment owned by a freshly-created owner.
		const cfg = makeFullFeatureConfig(`a7-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'active' });
		const owner = await createAdmin(ctx.supabase, 'owner');
		const editor = await createAdmin(ctx.supabase, 'editor');
		const viewer = await createAdmin(ctx.supabase, 'viewer');
		const nonCollab = await createAdmin(ctx.supabase, 'noncollab');
		await ctx.supabase.from('experiment_collaborators').insert([
			{ experiment_id: seeded.id, user_id: owner.id, role: 'owner' },
			{ experiment_id: seeded.id, user_id: editor.id, role: 'editor' },
			{ experiment_id: seeded.id, user_id: viewer.id, role: 'viewer' }
		]);

		// Also need a participant id to hit the participants/[pid] route.
		const { data: p } = await ctx.supabase
			.from('participants')
			.insert({
				experiment_id: seeded.id,
				email: `p-${Date.now()}@example.com`,
				registration_data: {},
				session_token: crypto.randomUUID()
			})
			.select('id')
			.single();

		const routes = [
			`/admin/experiments/${seeded.id}`,
			`/admin/experiments/${seeded.id}/config`,
			`/admin/experiments/${seeded.id}/data`,
			`/admin/experiments/${seeded.id}/versions`,
			`/admin/experiments/${seeded.id}/settings`,
			`/admin/experiments/${seeded.id}/participants/${p!.id}`
		];

		for (const [role, creds] of Object.entries({ owner, editor, viewer, nonCollab }) as Array<[Role, typeof owner]>) {
			// fresh page context for each admin to isolate cookies
			const context = await page.context().browser()!.newContext();
			const p2 = await context.newPage();
			await loginAs(p2, creds);
			for (const route of routes) {
				const res = await p2.goto(route);
				const status = res?.status() ?? 0;
				if (role === 'nonCollab') {
					// Expected: 404 (hide existence). Accept 404 only — 403 would
					// leak experiment existence.
					expect(status, `${role} on ${route}`).toBe(404);
				} else {
					// Expected: 200 for owner/editor/viewer (all three can read).
					expect(status, `${role} on ${route}`).toBe(200);
				}
			}
			await context.close();
		}

		// Cleanup
		for (const u of [owner, editor, viewer, nonCollab]) {
			await ctx.supabase.from('admin_users').delete().eq('user_id', u.id);
			await ctx.supabase.auth.admin.deleteUser(u.id);
		}
		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A7.2: mutation actions respect role (viewer cannot save config, editor can)', async ({
		page,
		ctx
	}) => {
		const cfg = makeFullFeatureConfig(`a72-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
		const editor = await createAdmin(ctx.supabase, 'editor');
		const viewer = await createAdmin(ctx.supabase, 'viewer');
		await ctx.supabase.from('experiment_collaborators').insert([
			{ experiment_id: seeded.id, user_id: editor.id, role: 'editor' },
			{ experiment_id: seeded.id, user_id: viewer.id, role: 'viewer' }
		]);

		// Viewer tries to save config → expect 403 via form POST (the action
		// guards with requireExperimentAccess('editor')).
		const viewerCtx = await page.context().browser()!.newContext();
		const viewerPage = await viewerCtx.newPage();
		await loginAs(viewerPage, viewer);
		const viewerRes = await viewerPage.request.post(
			`/admin/experiments/${seeded.id}/config?/saveConfig`,
			{
				form: {
					config: JSON.stringify(cfg),
					expectedUpdatedAt: ''
				}
			}
		);
		expect(viewerRes.status()).toBe(403);
		await viewerCtx.close();

		// Editor saves successfully.
		const editorCtx = await page.context().browser()!.newContext();
		const editorPage = await editorCtx.newPage();
		await loginAs(editorPage, editor);
		const editorRes = await editorPage.request.post(
			`/admin/experiments/${seeded.id}/config?/saveConfig`,
			{
				form: {
					config: JSON.stringify({ ...cfg, version: 2 }),
					expectedUpdatedAt: ''
				}
			}
		);
		// 200 or a SvelteKit JSON wrapper — anything NOT 403/401/404.
		expect([200, 204, 302].includes(editorRes.status()) || editorRes.status() < 400).toBe(true);
		await editorCtx.close();

		for (const u of [editor, viewer]) {
			await ctx.supabase.from('admin_users').delete().eq('user_id', u.id);
			await ctx.supabase.auth.admin.deleteUser(u.id);
		}
		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A7.2 bis: editor cannot delete experiment or invite collaborators (owner-only actions)', async ({
		page,
		ctx
	}) => {
		const cfg = makeFullFeatureConfig(`a72b-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
		const editor = await createAdmin(ctx.supabase, 'editor');
		// Need at least one owner so the last-owner invariant doesn't break teardown.
		await ctx.supabase.from('experiment_collaborators').insert([
			{ experiment_id: seeded.id, user_id: ctx.adminUserId, role: 'owner' },
			{ experiment_id: seeded.id, user_id: editor.id, role: 'editor' }
		]);

		const editorCtx = await page.context().browser()!.newContext();
		const editorPage = await editorCtx.newPage();
		await loginAs(editorPage, editor);

		// Editor attempts delete experiment → 403.
		const delRes = await editorPage.request.post(
			`/admin/experiments/${seeded.id}/settings?/delete`,
			{ form: {} }
		);
		expect(delRes.status()).toBe(403);

		// Editor attempts invite → 403.
		const inviteRes = await editorPage.request.post(
			`/admin/experiments/${seeded.id}/settings?/invite`,
			{ form: { email: 'nope@example.com', role: 'editor' } }
		);
		expect(inviteRes.status()).toBe(403);

		await editorCtx.close();
		await ctx.supabase.from('admin_users').delete().eq('user_id', editor.id);
		await ctx.supabase.auth.admin.deleteUser(editor.id);
		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A7.3: viewer UI — Save Config button is absent (read-only)', async ({ page, ctx }) => {
		const cfg = makeFullFeatureConfig(`a73-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
		const viewer = await createAdmin(ctx.supabase, 'viewer');
		await ctx.supabase.from('experiment_collaborators').insert([
			{ experiment_id: seeded.id, user_id: ctx.adminUserId, role: 'owner' },
			{ experiment_id: seeded.id, user_id: viewer.id, role: 'viewer' }
		]);

		const viewerCtx = await page.context().browser()!.newContext();
		const viewerPage = await viewerCtx.newPage();
		await loginAs(viewerPage, viewer);
		await viewerPage.goto(`/admin/experiments/${seeded.id}/config`);

		// Viewer should NOT see a Save Config button at all (the server action
		// would reject a direct POST, but the UI should be honest about it too).
		// If this fails, it's a usability bug worth noting — viewers clicking
		// Save and seeing 403 is confusing.
		const saveBtn = viewerPage.getByRole('button', { name: /save config/i });
		const saveBtnCount = await saveBtn.count();
		expect(saveBtnCount, 'Save Config button should be hidden for viewers').toBe(0);

		await viewerCtx.close();
		await ctx.supabase.from('admin_users').delete().eq('user_id', viewer.id);
		await ctx.supabase.auth.admin.deleteUser(viewer.id);
		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A6.6: sole owner UI — own collaborator row has no role dropdown and no Remove button', async ({
		page,
		ctx
	}) => {
		// The CollaboratorsPanel hides both the role <select> and the Remove
		// button when the row's userId matches myUserId (invariant: can't remove
		// yourself). For a sole-owner experiment, this means the single row
		// (the logged-in admin) shows a readonly role badge and zero actions.
		const cfg = makeFullFeatureConfig(`a66-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: seeded.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});

		await loginAsAdmin(page, ctx);
		await page.goto(`/admin/experiments/${seeded.id}/settings`);

		// The row containing "(you)" — that's the logged-in admin's row.
		const selfRow = page.locator('tr', { has: page.getByText(/\(you\)/i) });
		await expect(selfRow).toBeVisible();

		// No role dropdown in the self row.
		await expect(selfRow.locator('select[name="role"]')).toHaveCount(0);
		// No Remove button in the self row.
		await expect(selfRow.getByRole('button', { name: /^remove$/i })).toHaveCount(0);
		// A role badge is present instead (the read-only span).
		await expect(selfRow.getByText(/^owner$/)).toBeVisible();

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});
});
