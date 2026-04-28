import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * P1 — Participant registration. Drives the real browser form through the
 * email-entry step, the registration form (including conditional field), and
 * verifies the DB row is created with the correct registration data.
 */

let experimentId: string;
let slug: string;
let supabase: SupabaseClient;

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
	const cfg = makeFullFeatureConfig(`reg-${Date.now()}`);
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

test.describe('P1 registration', () => {
	test('P1.1: fresh email + required fields lands on first phase and writes participant row', async ({
		page,
		context
	}) => {
		const email = `p11-${Date.now()}@example.com`;
		await page.goto(`/e/${slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();

		// Registration form shows
		await expect(page.getByLabel(/age/i)).toBeVisible();
		await page.getByLabel(/age/i).fill('30');
		await page.getByLabel(/country/i).selectOption('us');
		await page.getByRole('button', { name: /register/i }).click();

		// Lands on first phase URL (no chunking, no tutorial)
		await page.waitForURL(/\/e\/.+\/main/);

		// DB row exists
		const { data: row } = await supabase
			.from('participants')
			.select('email, registration_data, session_token')
			.eq('experiment_id', experimentId)
			.eq('email', email)
			.maybeSingle();
		expect(row).not.toBeNull();
		expect(row!.registration_data).toMatchObject({ age: '30', country: 'us' });

		// session_token cookie is set and matches DB
		const cookies = await context.cookies();
		const sessionCookie = cookies.find((c) => c.name === 'session_token');
		expect(sessionCookie).toBeDefined();
		expect(sessionCookie!.value).toBe(row!.session_token);
		expect(sessionCookie!.httpOnly).toBe(true);
	});

	test('P1.3: conditional field appears only when country=jp is selected', async ({ page }) => {
		const email = `p13-${Date.now()}@example.com`;
		await page.goto(`/e/${slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();

		await expect(page.getByLabel(/age/i)).toBeVisible();
		// native_language is NOT visible before country=jp is chosen
		await expect(page.getByLabel(/native language/i)).toHaveCount(0);

		await page.getByLabel(/country/i).selectOption('jp');
		await expect(page.getByLabel(/native language/i)).toBeVisible();

		await page.getByLabel(/country/i).selectOption('us');
		await expect(page.getByLabel(/native language/i)).toHaveCount(0);
	});

	test('P1.4: returning same email → {found:true}, server sets session cookie, participant lands on phase URL', async ({
		page,
		context
	}) => {
		const email = `p14-${Date.now()}@example.com`;

		// First visit: register
		await page.goto(`/e/${slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('25');
		await page.getByLabel(/country/i).selectOption('us');
		await page.getByRole('button', { name: /register/i }).click();
		await page.waitForURL(/\/e\/.+\/main/);

		// Clear cookies, visit again with same email
		await context.clearCookies();
		await page.goto(`/e/${slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();

		// Should NOT show registration form (returning participant)
		await page.waitForURL(/\/e\/.+\/main/, { timeout: 5000 });

		// Cookie is re-issued
		const cookies = await context.cookies();
		expect(cookies.some((c) => c.name === 'session_token')).toBe(true);
	});

	test('P1.5: email with caps + whitespace is normalized to lowercase + trimmed', async ({
		page
	}) => {
		const rawEmail = `  P15-${Date.now()}@Example.com  `;
		const normalized = rawEmail.trim().toLowerCase();
		await page.goto(`/e/${slug}`);
		await page.getByLabel(/email/i).fill(rawEmail);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('40');
		await page.getByLabel(/country/i).selectOption('us');
		await page.getByRole('button', { name: /register/i }).click();
		await page.waitForURL(/\/e\/.+\/main/);

		const { data: row } = await supabase
			.from('participants')
			.select('email')
			.eq('experiment_id', experimentId)
			.eq('email', normalized)
			.maybeSingle();
		expect(row).not.toBeNull();
		expect(row!.email).toBe(normalized);
	});
});
