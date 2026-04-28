import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * A3 — Config editor. Focus on the JSON-mode save path because that's
 * where the ergonomics bugs live: invalid JSON syntax, schema violations
 * from the server-side Zod, and the optimistic-lock conflict when two tabs
 * race a save.
 */

async function createAndOpenConfig(page: import('@playwright/test').Page, ctx: { supabase: import('@supabase/supabase-js').SupabaseClient; adminUserId: string }) {
	await loginAsAdmin(page, ctx as never);
	// Seed directly via service role — admin UI creation only asks for slug +
	// title, so the config starts almost empty and tempts tests into testing
	// the creation form instead of the editor.
	const cfg = makeFullFeatureConfig(`a3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'draft' });
	// Make sure the test admin is an owner of the seeded experiment.
	await ctx.supabase.from('experiment_collaborators').insert({
		experiment_id: seeded.id,
		user_id: ctx.adminUserId,
		role: 'owner'
	});
	// Navigate the way a real admin does: land on the list, click Edit on the row.
	// (The experiment title in the list is a plain <td>, not a link — that's how
	// the admin has to click in.)
	await page.goto('/admin/experiments');
	const row = page.getByRole('row', { name: new RegExp(seeded.slug, 'i') });
	await row.getByRole('link', { name: /^edit$/i }).click();
	await page.waitForURL(/\/admin\/experiments\/[0-9a-f-]+/);
	await page.getByRole('link', { name: /^config$/i }).first().click();
	await page.waitForURL(/\/config$/);
	return { experimentId: seeded.id, slug: seeded.slug };
}

test.describe('A3 config editor (JSON mode)', () => {
	test('A3.2: invalid JSON syntax → parse error surfaced, save rejected', async ({ page, ctx }) => {
		await createAndOpenConfig(page, ctx);

		// Switch to Full JSON sub-section.
		// Wait for sidebar to render the sub-section buttons before clicking.
		await expect(page.getByRole('button', { name: /full json/i })).toBeVisible();
		await page.getByRole('button', { name: /full json/i }).first().click();
		// The JSON textarea is identifiable by its font-mono class.
		const jsonTextarea = page.locator('textarea[spellcheck="false"]').first();
		await expect(jsonTextarea).toBeVisible();
		await expect
			.poll(async () => (await jsonTextarea.inputValue()).trim().startsWith('{'), {
				timeout: 5000
			})
			.toBe(true);

		const textarea = page.locator('textarea[spellcheck="false"]').first();
		await expect(textarea).toBeVisible();
		await textarea.fill('{ this is not valid JSON');

		await page.getByRole('button', { name: /save config/i }).click();

		// Toast / error surface — server returns `Invalid JSON syntax.` via fail(400).
		await expect(page.getByText(/invalid json syntax/i)).toBeVisible({ timeout: 5000 });
	});

	test('A3.3: valid JSON but schema violation → Zod error list shown', async ({ page, ctx }) => {
		await createAndOpenConfig(page, ctx);

		// Wait for sidebar to render the sub-section buttons before clicking.
		await expect(page.getByRole('button', { name: /full json/i })).toBeVisible();
		await page.getByRole('button', { name: /full json/i }).first().click();
		// The JSON textarea is identifiable by its font-mono class.
		const jsonTextarea = page.locator('textarea[spellcheck="false"]').first();
		await expect(jsonTextarea).toBeVisible();
		await expect
			.poll(async () => (await jsonTextarea.inputValue()).trim().startsWith('{'), {
				timeout: 5000
			})
			.toBe(true);

		const textarea = page.locator('textarea[spellcheck="false"]').first();
		// Grab the current JSON, mutate it to violate the schema (blank out required
		// metadata.title), and paste it back.
		const current = JSON.parse(await textarea.inputValue());
		current.metadata.title = {}; // LocalizedString refines keys, but empty object is still "not valid metadata.title" — actually schema allows empty record; break it differently.
		// Remove a required top-level key: phases.
		delete current.phases;
		await textarea.fill(JSON.stringify(current, null, 2));

		await page.getByRole('button', { name: /save config/i }).click();

		// Server returns `Validation failed:\n<issues>`.
		await expect(page.getByText(/validation failed/i)).toBeVisible({ timeout: 5000 });
	});

	test('A3.4: optimistic lock — saving with a stale expectedUpdatedAt returns the conflict toast', async ({ page, ctx }) => {
		// Simulates the two-tab scenario without driving two browser contexts:
		// tab "B" is this page, and tab "A" is an out-of-band update via the
		// service-role client that advances experiments.updated_at between the
		// moment this page loaded and the moment it saves. That's exactly what
		// the optimistic lock guards against.
		const { experimentId } = await createAndOpenConfig(page, ctx);
		await expect(page.getByRole('button', { name: /full json/i })).toBeVisible();
		await page.getByRole('button', { name: /full json/i }).first().click();
		const ta = page.locator('textarea[spellcheck="false"]').first();
		await expect(ta).toBeVisible();
		await expect
			.poll(async () => (await ta.inputValue()).trim().startsWith('{'), { timeout: 5000 })
			.toBe(true);

		// Make a trivial edit in the page's JSON.
		const cfg = JSON.parse(await ta.inputValue());
		cfg.version = (cfg.version ?? 1) + 1;
		await ta.fill(JSON.stringify(cfg, null, 2));

		// Out-of-band: advance experiments.updated_at by issuing a bumped row
		// via service role. After this, the page's expectedUpdatedAt is stale.
		const { error: bumpErr } = await ctx.supabase
			.from('experiments')
			.update({ updated_at: new Date().toISOString() })
			.eq('id', experimentId);
		expect(bumpErr).toBeNull();

		// Save from the page — the server should return 409 / conflict toast.
		await page.getByRole('button', { name: /save config/i }).click();
		await expect(page.getByText(/modified by another admin/i)).toBeVisible({
			timeout: 10000
		});

		// Supporting DB check: the saved config was NOT the page's (version bump did not land).
		const { data: row } = await ctx.supabase
			.from('experiments')
			.select('config')
			.eq('id', experimentId)
			.single();
		expect((row!.config as { version?: number }).version ?? 1).not.toBe(cfg.version);

		// Cleanup the seeded experiment so teardown doesn't stumble.
		await ctx.supabase.from('experiments').delete().eq('id', experimentId);
	});

	test('A3.7: save button shows pulse indicator (●) when there are unsaved JSON changes', async ({
		page,
		ctx
	}) => {
		await createAndOpenConfig(page, ctx);
		// Wait for sidebar to render the sub-section buttons before clicking.
		await expect(page.getByRole('button', { name: /full json/i })).toBeVisible();
		await page.getByRole('button', { name: /full json/i }).first().click();
		// The JSON textarea is identifiable by its font-mono class.
		const jsonTextarea = page.locator('textarea[spellcheck="false"]').first();
		await expect(jsonTextarea).toBeVisible();
		await expect
			.poll(async () => (await jsonTextarea.inputValue()).trim().startsWith('{'), {
				timeout: 5000
			})
			.toBe(true);

		const saveBtn = page.getByRole('button', { name: /save config/i });
		// No dot before any edit.
		await expect(saveBtn).not.toContainText('●');

		const textarea = page.locator('textarea[spellcheck="false"]').first();
		const current = JSON.parse(await textarea.inputValue());
		current.version = (current.version ?? 1) + 1;
		await textarea.fill(JSON.stringify(current, null, 2));
		// Trigger input event for reactivity
		await textarea.press('End');

		// Dot appears when changed.
		await expect(saveBtn).toContainText('●');
	});
});
