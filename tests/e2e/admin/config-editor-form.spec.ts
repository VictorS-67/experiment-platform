import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * A3.1 / A3.5 / A3.6 — Form-mode editing path. The default admin flow is
 * the form editor; JSON mode is the power-user escape hatch. Regressions
 * here break the primary UX even when the JSON save works.
 */

async function openConfig(page: import('@playwright/test').Page, ctx: { supabase: import('@supabase/supabase-js').SupabaseClient; adminUserId: string }) {
	await loginAsAdmin(page, ctx as never);
	const cfg = makeFullFeatureConfig(`a3form-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
	const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
	await ctx.supabase.from('experiment_collaborators').insert({
		experiment_id: seeded.id,
		user_id: ctx.adminUserId,
		role: 'owner'
	});
	await page.goto('/admin/experiments');
	await page
		.getByRole('row', { name: new RegExp(seeded.slug, 'i') })
		.getByRole('link', { name: /^edit$/i })
		.click();
	await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);
	await page.getByRole('link', { name: /^config\s*●?\s*$/i }).first().click();
	await page.waitForURL(/\/config$/);
	return seeded;
}

test.describe('A3 form-mode config editor', () => {
	test('A3.1: edit a Metadata Title in Form mode → save → DB updates AND a new version row is inserted', async ({
		page,
		ctx
	}) => {
		const seeded = await openConfig(page, ctx);

		// Default section is Metadata — LocalizedInput for Title is on screen.
		const titleInput = page.getByRole('textbox', { name: /^Title \(en\)$/i });
		await expect(titleInput).toBeVisible();
		const newTitle = `Edited Title ${Date.now()}`;
		await titleInput.fill(newTitle);

		// Click the form-mode Save Config button (only rendered for editor+).
		await page.getByRole('button', { name: /save config/i }).click();
		await expect(page.getByText(/config saved/i)).toBeVisible({ timeout: 10000 });

		// Verify DB: experiment.config.metadata.title.en matches the new title
		// AND a new row was added to experiment_config_versions.
		const { data: exp } = await ctx.supabase
			.from('experiments')
			.select('config')
			.eq('id', seeded.id)
			.single();
		expect((exp!.config as { metadata: { title: Record<string, string> } }).metadata.title.en).toBe(
			newTitle
		);
		const { data: versions } = await ctx.supabase
			.from('experiment_config_versions')
			.select('id')
			.eq('experiment_id', seeded.id);
		expect((versions ?? []).length).toBe(1);

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A3.5: form → JSON switch reflects in-flight edits; JSON → form switch keeps them', async ({
		page,
		ctx
	}) => {
		const seeded = await openConfig(page, ctx);

		// Edit title in Form mode (don't save).
		const tag = `Round-Trip ${Date.now()}`;
		await page.getByRole('textbox', { name: /^Title \(en\)$/i }).fill(tag);

		// Switch to Full JSON without saving.
		await page.getByRole('button', { name: /full json/i }).first().click();
		const ta = page.locator('textarea[spellcheck="false"]').first();
		await expect(ta).toBeVisible();
		const json1 = await ta.inputValue();
		expect(json1).toContain(tag);

		// Tweak in JSON (add defaultLanguage change), switch back to Form mode.
		const cfg = JSON.parse(json1);
		cfg.metadata.defaultLanguage = 'ja';
		await ta.fill(JSON.stringify(cfg, null, 2));
		await page.getByRole('button', { name: /^metadata$/i }).first().click();

		// Back in Form mode — title edit should still be there AND the
		// defaultLanguage dropdown should read JA.
		await expect(page.getByRole('textbox', { name: /^Title \(en\)$/i })).toHaveValue(tag);
		await expect(page.getByRole('combobox').first()).toHaveValue('ja');

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A3.6: beforeNavigate guard fires when navigating away with unsaved changes', async ({
		page,
		ctx
	}) => {
		const seeded = await openConfig(page, ctx);

		// Make an edit and confirm the UI flipped to "dirty" via the sidebar
		// pulse. Without this, dialog-count assertions below would race.
		await page
			.getByRole('textbox', { name: /^Title \(en\)$/i })
			.fill(`Unsaved ${Date.now()}`);
		// The save button should now show ● (form-mode variant has the dot
		// inside the button text). Waiting on it is a race-free proxy for
		// "dirty state has propagated".
		await expect(page.getByRole('button', { name: /save config/i })).toContainText('●', {
			timeout: 5000
		});

		// Register dialog handler: cancel the first one (Stay on page).
		let dialogCount = 0;
		page.on('dialog', async (dialog) => {
			dialogCount++;
			if (dialogCount === 1) {
				await dialog.dismiss(); // Stay
			} else {
				await dialog.accept(); // Leave
			}
		});

		// Click Settings link — should trigger the guard.
		await page.getByRole('link', { name: /^settings$/i }).first().click();
		await page.waitForTimeout(500);

		// Cancel path: still on /config, dialog fired once.
		await expect(page).toHaveURL(/\/config$/);
		expect(dialogCount).toBe(1);

		// Try again — now accept the leave prompt.
		await page.getByRole('link', { name: /^settings$/i }).first().click();
		await expect(page).toHaveURL(/\/settings/, { timeout: 10000 });
		expect(dialogCount).toBeGreaterThanOrEqual(2);

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});
});
