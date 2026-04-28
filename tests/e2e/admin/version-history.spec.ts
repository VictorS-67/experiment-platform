import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * A4 — Version history. Each config save writes a new row in
 * `experiment_config_versions`. The versions tab lists them and offers a
 * Restore button per non-current row; restore creates a NEW version rather
 * than mutating history.
 */

async function openConfigAsOwner(page: import('@playwright/test').Page, ctx: { supabase: import('@supabase/supabase-js').SupabaseClient; adminUserId: string }) {
	await loginAsAdmin(page, ctx as never);
	// The config editor's beforeNavigate guard fires when navigating away
	// with unsaved changes. The page is reporting ● dirty even after save —
	// that's the Bug#1 below — so the guard always pops a confirm. Accept it
	// so our navigations don't stall.
	page.on('dialog', (d) => d.accept());
	const cfg = makeFullFeatureConfig(`a4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
	await ctx.supabase.from('experiment_collaborators').insert({
		experiment_id: seeded.id,
		user_id: ctx.adminUserId,
		role: 'owner'
	});
	return seeded;
}

async function clickFullJsonAndSave(page: import('@playwright/test').Page, versionBump: number) {
	// The Config sidebar link can render as "Config" or "Config ●" (unsaved
	// indicator). Match either form.
	await page.getByRole('link', { name: /^config\s*●?\s*$/i }).first().click();
	await page.waitForURL(/\/config$/);
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('button', { name: /full json/i })).toBeVisible();
	await page.getByRole('button', { name: /full json/i }).first().click();
	const ta = page.locator('textarea[spellcheck="false"]').first();
	await expect(ta).toBeVisible({ timeout: 10_000 });
	await expect
		.poll(async () => (await ta.inputValue()).trim().startsWith('{'), { timeout: 5000 })
		.toBe(true);
	const cfg = JSON.parse(await ta.inputValue());
	cfg.version = versionBump;
	await ta.fill(JSON.stringify(cfg, null, 2));
	await page.getByRole('button', { name: /save config/i }).click();
	await expect(page.getByText(/config saved/i)).toBeVisible({ timeout: 10000 });
}

test.describe('A4 version history', () => {
	test('A4.1: versions list renders newest-first with timestamps + Restore on non-current rows', async ({
		page,
		ctx
	}) => {
		const seeded = await openConfigAsOwner(page, ctx);
		// Navigate list → Edit
		await page.goto('/admin/experiments');
		await page.getByRole('row', { name: new RegExp(seeded.slug, 'i') }).getByRole('link', { name: /^edit$/i }).click();
		await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);

		// Save 3 times with bumped versions to produce 3 version rows.
		for (const v of [2, 3, 4]) {
			await clickFullJsonAndSave(page, v);
			// Let the post-save re-sync settle before the next iteration —
			// without this, back-to-back saves can overlap and one of the
			// `upsert_config_with_version` calls sees a stale expected_updated_at.
			await page.waitForTimeout(200);
		}

		// Click into the Versions tab via the sidebar nav.
		// Navigate to versions — use page.goto because clicking the Versions
		// link after a save in this session is flaky (the post-save hydration
		// timing races with the nav intercept). The versions tab rendering
		// itself is what A4 is about, not the nav click.
		await page.goto(page.url().replace(/\/config\/?$/, '/versions'));
		await page.waitForLoadState('networkidle');

		// Should list 3 rows ordered newest-first (v3, v2, v1) — note that the
		// initial seeded config itself has NOT been saved through the editor,
		// so only the 3 editor-saves become version rows.
		const rows = page.locator('tbody tr');
		await expect(rows).toHaveCount(3);
		// First row shows "current" label, not a Restore button.
		await expect(rows.nth(0).locator('td').nth(0)).toContainText(/v\d+/);
		await expect(rows.nth(0)).toContainText(/current/i);
		// Second and third rows have Restore buttons.
		await expect(rows.nth(1).getByRole('button', { name: /restore/i })).toBeVisible();
		await expect(rows.nth(2).getByRole('button', { name: /restore/i })).toBeVisible();

		// Versions are ordered with descending version_number.
		const numbers = await rows.locator('td').nth(0).allTextContents();
		const nums = numbers.map((s) => parseInt(s.replace(/[^\d]/g, ''), 10));
		expect(nums).toEqual([...nums].sort((a, b) => b - a));

		// Supporting DB check.
		const { data } = await ctx.supabase
			.from('experiment_config_versions')
			.select('id, version_number')
			.eq('experiment_id', seeded.id);
		expect((data ?? []).length).toBe(3);

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A4.3: restoring an older version creates a NEW version row and updates the live config', async ({
		page,
		ctx
	}) => {
		const seeded = await openConfigAsOwner(page, ctx);
		await page.goto('/admin/experiments');
		await page.getByRole('row', { name: new RegExp(seeded.slug, 'i') }).getByRole('link', { name: /^edit$/i }).click();
		await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);

		// Save v2 then v3 (different distinguishing marker).
		await clickFullJsonAndSave(page, 2);
		await page.waitForTimeout(200);
		await clickFullJsonAndSave(page, 3);
		await page.waitForTimeout(200);

		// Versions tab — Restore the last (oldest) version (v2).
		// Navigate to versions — use page.goto because clicking the Versions
		// link after a save in this session is flaky (the post-save hydration
		// timing races with the nav intercept). The versions tab rendering
		// itself is what A4 is about, not the nav click.
		await page.goto(page.url().replace(/\/config\/?$/, '/versions'));
		await page.waitForLoadState('networkidle');
		const rows = page.locator('tbody tr');
		await expect(rows).toHaveCount(2);
		const restoreBtn = rows.nth(1).getByRole('button', { name: /restore/i });
		await restoreBtn.click();

		// Toast + new version row appears (count 3 now).
		await expect(page.getByText(/config restored|restored to selected/i)).toBeVisible({
			timeout: 10000
		});

		// DB: 3 version rows (v1 v2 v3 saves + the restore = 3 saves total so
		// 3 rows). Actually, editor saves produced 2 rows (v=2, v=3) and the
		// rollback creates a 3rd.
		const { data } = await ctx.supabase
			.from('experiment_config_versions')
			.select('id')
			.eq('experiment_id', seeded.id);
		expect((data ?? []).length).toBe(3);

		// Live config is now the restored version (version: 2).
		const { data: liveRow } = await ctx.supabase
			.from('experiments')
			.select('config')
			.eq('id', seeded.id)
			.single();
		expect((liveRow!.config as { version: number }).version).toBe(2);

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A4.4: rollback with stale expectedUpdatedAt should be rejected (optimistic lock)', async ({
		page,
		ctx
	}) => {
		const seeded = await openConfigAsOwner(page, ctx);
		await page.goto('/admin/experiments');
		await page.getByRole('row', { name: new RegExp(seeded.slug, 'i') }).getByRole('link', { name: /^edit$/i }).click();
		await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);

		await clickFullJsonAndSave(page, 2);
		await page.waitForTimeout(200);
		await clickFullJsonAndSave(page, 3);
		await page.waitForTimeout(200);

		// Land on versions page (this captures experiment.updated_at for the
		// hidden expectedUpdatedAt form field, conceptually — the admin is
		// looking at a stale snapshot).
		// Navigate to versions — use page.goto because clicking the Versions
		// link after a save in this session is flaky (the post-save hydration
		// timing races with the nav intercept). The versions tab rendering
		// itself is what A4 is about, not the nav click.
		await page.goto(page.url().replace(/\/config\/?$/, '/versions'));
		await page.waitForLoadState('networkidle');

		// Out-of-band: advance experiments.updated_at (simulates another admin
		// saving the config in tab A while this tab is still on the versions list).
		const { error: bumpErr } = await ctx.supabase
			.from('experiments')
			.update({ updated_at: new Date().toISOString() })
			.eq('id', seeded.id);
		expect(bumpErr).toBeNull();

		// Click Restore on the oldest version.
		const rows = page.locator('tbody tr');
		const restoreBtn = rows.nth(1).getByRole('button', { name: /restore/i });
		await restoreBtn.click();

		// EXPECTED (per playbook A4.4): conflict toast / error, NOT silent success.
		await expect(
			page.getByText(/modified by another admin|config was modified|conflict/i)
		).toBeVisible({ timeout: 10000 });

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});
});
