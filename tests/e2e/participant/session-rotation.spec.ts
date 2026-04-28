import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * P2 — Participant session rotation (24h, GET-only).
 *
 * The hook in src/hooks.server.ts checks `last_rotated_at` on every participant
 * GET to /e/* and rotates the token if older than 24h. POSTs deliberately
 * skip rotation to avoid mid-write cookie races.
 */

let experimentId: string;
let slug: string;
let supabase: SupabaseClient;

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
	const cfg = makeFullFeatureConfig(`p2-${Date.now()}`);
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

async function registerAndLand(page: import('@playwright/test').Page, email: string) {
	await page.goto(`/e/${slug}`);
	await page.getByLabel(/email/i).fill(email);
	await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
	await page.getByLabel(/age/i).fill('30');
	await page.getByLabel(/country/i).selectOption('us');
	await page.getByRole('button', { name: /register/i }).click();
	await page.waitForURL(/\/main/);
}

async function readSessionCookie(context: import('@playwright/test').BrowserContext) {
	const cookies = await context.cookies();
	return cookies.find((c) => c.name === 'session_token')?.value ?? null;
}

test.describe('P2 session rotation', () => {
	test('P2.1: stale GET (>24h since last_rotated_at) rotates the token in cookie + DB', async ({
		page,
		context
	}) => {
		const email = `p21-${Date.now()}@example.com`;
		await registerAndLand(page, email);

		const cookieBefore = await readSessionCookie(context);
		expect(cookieBefore).toBeTruthy();

		const { data: participant } = await supabase
			.from('participants')
			.select('id, session_token, last_rotated_at')
			.eq('experiment_id', experimentId)
			.eq('email', email)
			.single();
		expect(participant!.session_token).toBe(cookieBefore);

		// Backdate last_rotated_at by 25h to trigger the rotation branch.
		const backdated = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		await supabase
			.from('participants')
			.update({ last_rotated_at: backdated })
			.eq('id', participant!.id);

		// Reload the phase page (a GET).
		await page.reload();
		await page.waitForURL(/\/main/);

		const cookieAfter = await readSessionCookie(context);
		expect(cookieAfter).toBeTruthy();
		expect(cookieAfter).not.toBe(cookieBefore);

		const { data: rotated } = await supabase
			.from('participants')
			.select('session_token, last_rotated_at')
			.eq('id', participant!.id)
			.single();
		expect(rotated!.session_token).toBe(cookieAfter);
		// Rotation timestamp moved forward (within the last minute).
		const rotatedAtMs = new Date(rotated!.last_rotated_at as string).getTime();
		expect(Date.now() - rotatedAtMs).toBeLessThan(60_000);
	});

	test('P2.2: POST does NOT rotate even when last_rotated_at is stale', async ({
		page,
		context
	}) => {
		const email = `p22-${Date.now()}@example.com`;
		await registerAndLand(page, email);

		const cookieBefore = await readSessionCookie(context);
		const { data: participant } = await supabase
			.from('participants')
			.select('id')
			.eq('experiment_id', experimentId)
			.eq('email', email)
			.single();

		const backdated = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		await supabase
			.from('participants')
			.update({ last_rotated_at: backdated })
			.eq('id', participant!.id);

		// Fire a POST to the save endpoint. We expect 400 (no payload) — what
		// matters here is that the request reached the handler without the
		// hook rotating the cookie underneath it.
		await page.request.post(`/e/${slug}/main/save`, {
			data: { phaseId: 'main', stimulusId: 's1', responseData: {}, responseIndex: 0 }
		});

		// The browser-side cookie didn't change.
		const cookieAfter = await readSessionCookie(context);
		expect(cookieAfter).toBe(cookieBefore);

		// DB row's last_rotated_at is still the backdated value (within 1s
		// tolerance for clock skew on the supabase update).
		const { data: after } = await supabase
			.from('participants')
			.select('session_token, last_rotated_at')
			.eq('id', participant!.id)
			.single();
		const stillBackdated =
			Math.abs(new Date(after!.last_rotated_at as string).getTime() - new Date(backdated).getTime()) <
			1000;
		expect(stillBackdated).toBe(true);
		expect(after!.session_token).toBe(cookieBefore);
	});

	test('P2.3: deleted participant row → cookie cleared + redirect to registration on next GET', async ({
		page,
		context
	}) => {
		const email = `p23-${Date.now()}@example.com`;
		await registerAndLand(page, email);

		const cookieBefore = await readSessionCookie(context);
		expect(cookieBefore).toBeTruthy();

		const { data: participant } = await supabase
			.from('participants')
			.select('id')
			.eq('experiment_id', experimentId)
			.eq('email', email)
			.single();
		await supabase.from('participants').delete().eq('id', participant!.id);

		await page.goto(`/e/${slug}/main`);
		// Redirected to the registration entry page.
		await page.waitForURL(new RegExp(`/e/${slug}$`));

		// Stale cookie cleared by the hook.
		const cookieAfter = await readSessionCookie(context);
		expect(cookieAfter).toBeNull();
	});
});
