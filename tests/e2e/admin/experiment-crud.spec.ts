import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * A2.1 / A2.2 / A2.4 — Admin experiment create, duplicate, and list filtering.
 */

test.describe('A2 experiment CRUD', () => {
	test('A2.1: create → creator becomes sole owner via experiment_collaborators trigger', async ({
		page,
		ctx
	}) => {
		await loginAsAdmin(page, ctx);
		const slug = `a21-${Date.now()}`;

		// Real admin flow: nav into New Experiment via the list page link.
		await expect(page).toHaveURL(/\/admin\/experiments/);
		await page.getByRole('link', { name: /new experiment/i }).first().click();
		await page.getByLabel(/slug/i).fill(slug);
		await page.getByLabel(/title \(english\)/i).fill('A2.1 Create');
		await page.getByRole('button', { name: /create experiment/i }).click();
		await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);

		const expId = page.url().match(/experiments\/([0-9a-f-]{36})/)?.[1];
		expect(expId).toBeTruthy();

		// Supporting DB check: experiments.created_by = test admin;
		// experiment_collaborators has 1 row with role=owner for the same user.
		const { data: exp } = await ctx.supabase
			.from('experiments')
			.select('created_by')
			.eq('id', expId!)
			.single();
		expect(exp!.created_by).toBe(ctx.adminUserId);

		const { data: collabs } = await ctx.supabase
			.from('experiment_collaborators')
			.select('user_id, role')
			.eq('experiment_id', expId!);
		expect(collabs).toHaveLength(1);
		expect(collabs![0]).toMatchObject({ user_id: ctx.adminUserId, role: 'owner' });

		// Cleanup (migration 021 lets us delete as sole owner).
		await ctx.supabase.from('experiments').delete().eq('id', expId!);
	});

	test('A2.2: creating with a duplicate slug surfaces a validation error, no row created', async ({
		page,
		ctx
	}) => {
		// Seed an experiment with a known slug first.
		const slug = `a22-${Date.now()}`;
		const cfg = makeFullFeatureConfig(slug);
		cfg.slug = slug;
		const existing = await seedExperiment(cfg, { supabase: ctx.supabase });

		await loginAsAdmin(page, ctx);
		await page.getByRole('link', { name: /new experiment/i }).first().click();
		await page.getByLabel(/slug/i).fill(slug);
		await page.getByLabel(/title \(english\)/i).fill('A2.2 Duplicate');
		await page.getByRole('button', { name: /create experiment/i }).click();

		// Expect an inline error, still on the /new page.
		await expect(page).toHaveURL(/\/admin\/experiments\/new/);
		await expect(page.getByText(/already taken/i).first()).toBeVisible();

		// DB still has only the original row with that slug.
		const { data: dups } = await ctx.supabase
			.from('experiments')
			.select('id')
			.eq('slug', slug);
		expect(dups).toHaveLength(1);
		expect(dups![0].id).toBe(existing.id);

		await ctx.supabase.from('experiments').delete().eq('id', existing.id);
	});

	test('A2.4: list page only shows experiments the current admin collaborates on', async ({
		page,
		ctx
	}) => {
		// Seed 2 experiments. Only experiment A has the test admin as a collaborator.
		const cfgA = makeFullFeatureConfig(`a24-mine-${Date.now()}`);
		const cfgB = makeFullFeatureConfig(`a24-theirs-${Date.now()}`);
		const a = await seedExperiment(cfgA, { supabase: ctx.supabase });
		const b = await seedExperiment(cfgB, { supabase: ctx.supabase });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: a.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});

		// Create a second admin who owns B so the last-owner invariant doesn't
		// block cleanup of B.
		const other = await ctx.supabase.auth.admin.createUser({
			email: `a24-other-${Date.now()}@example.com`,
			password: 'Otherpw-12345',
			email_confirm: true
		});
		await ctx.supabase.from('admin_users').insert({ user_id: other.data.user!.id, role: 'admin' });
		await ctx.supabase
			.from('experiment_collaborators')
			.insert({ experiment_id: b.id, user_id: other.data.user!.id, role: 'owner' });

		await loginAsAdmin(page, ctx);
		await page.goto('/admin/experiments');

		// A appears in the list; B does not.
		await expect(page.getByRole('row', { name: new RegExp(a.slug, 'i') })).toBeVisible();
		await expect(page.getByRole('row', { name: new RegExp(b.slug, 'i') })).toHaveCount(0);

		await ctx.supabase.from('experiments').delete().in('id', [a.id, b.id]);
		await ctx.supabase.from('admin_users').delete().eq('user_id', other.data.user!.id);
		await ctx.supabase.auth.admin.deleteUser(other.data.user!.id);
	});
});
