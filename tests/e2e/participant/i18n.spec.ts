import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * P9 — i18n. The full-feature fixture has both `en` and `ja` localized
 * strings; defaultLanguage is `en`. The header renders a language selector
 * when supportedLanguages.length > 1, switching it should:
 *   - swap config-string renders (LocalizedString.{en,ja}) AND platform keys,
 *   - update <html lang="…">,
 *   - persist the choice in localStorage so reloads keep the user in the
 *     selected language.
 */

let experimentId: string;
let slug: string;
let supabase: SupabaseClient;

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
	const cfg = makeFullFeatureConfig(`p9-${Date.now()}`);
	const seeded = await seedExperiment(cfg, { supabase });
	experimentId = seeded.id;
	slug = seeded.slug;
});

test.afterAll(async () => {
	if (experimentId) await supabase.from('experiments').delete().eq('id', experimentId);
});

test.beforeEach(async () => {
	if (supabase) await supabase.from('rate_limits').delete().eq('endpoint', '/auth');
});

test.describe('P9 i18n', () => {
	test('P9.1: language selector switches strings, updates <html lang>, persists across reload', async ({
		page
	}) => {
		test.setTimeout(60_000);

		const email = `p9-${Date.now()}@example.com`;
		await page.goto(`/e/${slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('30');
		await page.getByLabel(/country/i).selectOption('us');
		await page.getByRole('button', { name: /register/i }).click();
		await page.waitForURL(/\/main/);

		// Default language is en. The gatekeeper question renders the English
		// localized string from the fixture: "Have you seen this before?".
		await expect(page.getByText(/have you seen this before/i)).toBeVisible();
		expect(await page.locator('html').getAttribute('lang')).toBe('en');

		// Switch to Japanese via the header selector.
		await page.locator('#language-selector').selectOption('ja');

		// Gatekeeper now renders the Japanese fixture string.
		await expect(page.getByText('これを見たことがありますか?')).toBeVisible();
		expect(await page.locator('html').getAttribute('lang')).toBe('ja');

		// localStorage was updated.
		const stored = await page.evaluate(() =>
			localStorage.getItem('experiment-platform.language')
		);
		expect(stored).toBe('ja');

		// Reload — language choice persists.
		await page.reload();
		await page.waitForURL(/\/main/);
		await expect(page.getByText('これを見たことがありますか?')).toBeVisible();
		expect(await page.locator('html').getAttribute('lang')).toBe('ja');
	});
});
