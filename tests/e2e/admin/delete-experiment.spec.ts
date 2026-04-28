import { test, expect, loginAsAdmin } from '../fixtures';

/**
 * A2.3 — Owner can delete their own experiment via the admin UI.
 *
 * Regression for the cascade trigger fix in migration 021. Previously the
 * `enforce_owner_invariant` BEFORE DELETE trigger fired on the cascaded
 * `experiment_collaborators` row and raised P0005 before the parent
 * `experiments` row disappeared, aborting the cascade — so the sole owner
 * could never delete their own experiment.
 *
 * Tested the way a real admin does it: land on /admin/experiments, click
 * into the experiment, navigate to Settings, click Delete, type the
 * confirmation phrase, submit. Verify (a) a redirect to the list, (b) the
 * experiment no longer appears in the list, (c) the DB row is gone.
 */

test.describe('A2 experiment CRUD', () => {
	test('A2.3: owner deletes their own experiment through the UI', async ({ page, ctx }) => {
		await loginAsAdmin(page, ctx);

		// Land on list → create new experiment.
		await expect(page).toHaveURL(/\/admin\/experiments/);
		await page.getByRole('link', { name: /new experiment|create/i }).first().click();

		const slug = `e2e-del-ui-${Date.now()}`;
		await page.getByLabel(/slug/i).fill(slug);
		await page.getByLabel(/title \(english\)/i).fill('To Be Deleted');
		await page.getByRole('button', { name: /create experiment/i }).click();
		await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);
		const detailUrl = page.url();
		const experimentId = detailUrl.match(/experiments\/([0-9a-f-]{36})/)?.[1];
		expect(experimentId).toBeTruthy();

		// Go to Settings via nav (not page.goto).
		await page.getByRole('link', { name: /settings/i }).first().click();
		await page.waitForURL(/\/settings/);

		// Open the delete confirmation modal.
		await page.getByRole('button', { name: /^delete experiment$/i }).first().click();

		// Confirm button is disabled until the phrase matches.
		const confirmButton = page.getByRole('button', { name: /^delete experiment$/i }).last();
		await expect(confirmButton).toBeDisabled();

		// Wrong phrase → still disabled.
		const confirmInput = page.getByLabel(/confirm deletion phrase/i);
		await confirmInput.fill('delete');
		await expect(confirmButton).toBeDisabled();

		// Correct phrase unlocks it.
		await confirmInput.fill('delete experiment');
		await expect(confirmButton).toBeEnabled();
		await confirmButton.click();

		// Should redirect to the list page.
		await page.waitForURL(/\/admin\/experiments$/);

		// Experiment no longer visible in the list.
		await expect(page.getByRole('link', { name: new RegExp(slug, 'i') })).toHaveCount(0);

		// Supporting DB check: parent row AND all collaborators are gone.
		const { data: expRow } = await ctx.supabase
			.from('experiments')
			.select('id')
			.eq('id', experimentId!)
			.maybeSingle();
		expect(expRow).toBeNull();
		const { data: collab } = await ctx.supabase
			.from('experiment_collaborators')
			.select('id')
			.eq('experiment_id', experimentId!);
		expect(collab ?? []).toHaveLength(0);
	});

	test('A2.3 bis: Cancel in the delete modal aborts — experiment still there', async ({ page, ctx }) => {
		await loginAsAdmin(page, ctx);
		await page.goto('/admin/experiments/new');
		const slug = `e2e-del-cancel-${Date.now()}`;
		await page.getByLabel(/slug/i).fill(slug);
		await page.getByLabel(/title \(english\)/i).fill('Keep Me');
		await page.getByRole('button', { name: /create experiment/i }).click();
		await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);

		await page.getByRole('link', { name: /settings/i }).first().click();

		await page.getByRole('button', { name: /^delete experiment$/i }).first().click();
		await page.getByLabel(/confirm deletion phrase/i).fill('delete experiment');
		await page.getByRole('button', { name: /cancel/i }).click();

		// Still on settings page.
		await expect(page).toHaveURL(/\/settings/);

		// The per-test ctx cleanup will delete this experiment after the test.
	});
});
