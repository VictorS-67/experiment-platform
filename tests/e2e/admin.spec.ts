import { test, expect, loginAsAdmin } from './fixtures';

test.describe('Admin flow', () => {
	test('admin can log in, create an experiment, and reach its config page', async ({ page, ctx }) => {
		await loginAsAdmin(page, ctx);

		// Create a new experiment
		await page.goto('/admin/experiments/new');
		const slug = `e2e-${Date.now()}`;
		await page.getByLabel(/slug/i).fill(slug);
		await page.getByLabel(/title \(english\)/i).fill('E2E Test');
		await page.getByRole('button', { name: /create/i }).click();

		// Should land on the experiment detail page
		await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);
		await expect(page.locator('h1, h2').filter({ hasText: /config|settings|E2E Test/i }).first()).toBeVisible();

		// Config tab renders the JSON editor / form editor
		await page.getByRole('link', { name: /config/i }).first().click();
		await expect(page.getByRole('button', { name: /save config/i })).toBeVisible();
	});

	test('owner can delete their own experiment (cascade unblocks invariant)', async ({ ctx }) => {
		// Regression test for the enforce_owner_invariant trigger blocking
		// ON DELETE CASCADE. Before migration 021, this fails with P0005
		// because the per-row trigger fires before the parent row is gone.
		const { data: exp, error: createErr } = await ctx.supabase
			.from('experiments')
			.insert({ slug: `e2e-del-${Date.now()}`, config: { version: 1 }, created_by: ctx.adminUserId })
			.select('id')
			.single();
		expect(createErr).toBeNull();
		expect(exp?.id).toBeTruthy();

		const { error: delErr } = await ctx.supabase.from('experiments').delete().eq('id', exp!.id);
		expect(delErr).toBeNull();

		const { data: remaining } = await ctx.supabase
			.from('experiment_collaborators')
			.select('id')
			.eq('experiment_id', exp!.id);
		expect(remaining ?? []).toHaveLength(0);
	});

	test('admin login rejects bad password', async ({ page, ctx }) => {
		await page.goto('/admin/login');
		await page.getByLabel(/email/i).fill(ctx.adminEmail);
		await page.getByLabel(/password/i).fill('wrong-password');
		await page.getByRole('button', { name: /sign in/i }).click();
		await expect(page.getByText(/invalid email or password/i)).toBeVisible();
	});
});
