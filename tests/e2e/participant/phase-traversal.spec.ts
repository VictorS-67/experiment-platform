import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * P3 / P4 — stimulus-response phase traversal:
 *   - P3.2: missing required widget blocks save (user-visible error, no DB row)
 *   - P3.5: gatekeeper "No" with skipToNext=true hides widgets, advances,
 *           and stores JSON null per widget in response_data
 *   - P4.1: skipRule fires when triggering widget matches — target stimulus
 *           is auto-skipped and never surfaced in the nav
 */

let experimentId: string;
let slug: string;
let supabase: SupabaseClient;

async function register(page: import('@playwright/test').Page, email: string) {
	await page.goto(`/e/${slug}`);
	await page.getByLabel(/email/i).fill(email);
	await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
	await page.getByLabel(/age/i).fill('30');
	await page.getByLabel(/country/i).selectOption('us');
	await page.getByRole('button', { name: /register/i }).click();
	await page.waitForURL(/\/e\/.+\/main/);
}

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
	const cfg = makeFullFeatureConfig(`p3-${Date.now()}`);
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

test.describe('P3 / P4 traversal', () => {
	test('P3.2: required widget missing → save blocked, no DB row', async ({ page }) => {
		const email = `p32-${Date.now()}@example.com`;
		await register(page, email);

		// Click "Yes" on gatekeeper so widgets show.
		await page.locator('#gatekeeper-yes').click();

		// Click Save WITHOUT filling the required likert (rating). The optional
		// comment textarea can stay empty.
		await page.getByRole('button', { name: /save/i }).click();

		// Expect an inline error message visible on screen.
		const errorBanner = page.locator('.message.error').first();
		await expect(errorBanner).toBeVisible();

		// DB: no response rows for this participant.
		const { data: participant } = await supabase
			.from('participants')
			.select('id')
			.eq('email', email)
			.eq('experiment_id', experimentId)
			.single();
		const { count } = await supabase
			.from('responses')
			.select('id', { count: 'exact', head: true })
			.eq('participant_id', participant!.id);
		expect(count ?? 0).toBe(0);
	});

	test('P3.5: gatekeeper No → widgets hidden, JSON null per widget stored, auto-advance', async ({
		page
	}) => {
		const email = `p35-${Date.now()}@example.com`;
		await register(page, email);

		// Click "No" — the gatekeeper posts silently with JSON null per widget
		// and advances. (Pre-migration the value was the configurable
		// `noResponseValue` per gatekeeper; that was dropped in the
		// gatekeeper-restructure schema change — see migrate-configs-rules.ts.)
		await page.locator('#gatekeeper-no').click();

		// Wait for the save to commit. We observe the DB because the UI advances
		// to the next stimulus immediately (no stable toast for success-then-advance).
		const { data: participant } = await supabase
			.from('participants')
			.select('id')
			.eq('email', email)
			.eq('experiment_id', experimentId)
			.single();
		await expect
			.poll(async () => {
				const { count } = await supabase
					.from('responses')
					.select('id', { count: 'exact', head: true })
					.eq('participant_id', participant!.id);
				return count ?? 0;
			}, { timeout: 4000 })
			.toBe(1);

		const { data: row } = await supabase
			.from('responses')
			.select('stimulus_id, response_data')
			.eq('participant_id', participant!.id)
			.single();
		// First stimulus is s1; gatekeeper No writes JSON null per widget.
		expect(row!.stimulus_id).toBe('s1');
		expect(row!.response_data).toMatchObject({ rating: null });
	});

	test('P4.1: skipRule (s1.rating=1 → skip s3) auto-writes a s3 skip row and keeps s3 out of the flow', async ({
		page
	}) => {
		const email = `p41-${Date.now()}@example.com`;
		await register(page, email);

		// s1: gatekeeper Yes, rating=1 (triggers the skip rule).
		await page.locator('#gatekeeper-yes').click();
		await page.getByRole('button', { name: '1' }).first().click();
		await page.getByRole('button', { name: /save/i }).click();

		// After s1, s2 is next (skipRule targets s3). Complete s2 normally.
		await page.locator('#gatekeeper-yes').click();
		await page.getByRole('button', { name: '3' }).first().click();
		await page.getByRole('button', { name: /save/i }).click();

		// At this point the participant should see the completion modal for the
		// phase (s3 was auto-skipped during advanceToNext). The skip rule writes
		// a `_skipped_by_rule` response row for s3 server-side.
		// Scope to dialog so we wait for the COMPLETION modal to render, not the
		// NavStrip's "Next →" which is always visible (just disabled at the
		// last item) and would falsely satisfy this assertion.
		const nextPhaseBtn = page.getByRole('dialog').getByRole('button', { name: /next phase|next/i });
		await expect(nextPhaseBtn).toBeVisible({ timeout: 6000 });

		// DB: 3 rows for phase p1: s1 (rating=1), s2 (rating=3), s3 (auto-skip _skipped_by_rule).
		const { data: participant } = await supabase
			.from('participants')
			.select('id')
			.eq('email', email)
			.eq('experiment_id', experimentId)
			.single();
		const { data: rows } = await supabase
			.from('responses')
			.select('stimulus_id, response_data')
			.eq('participant_id', participant!.id)
			.eq('phase_id', 'p1');
		expect((rows ?? []).length).toBe(3);
		const byStim = new Map((rows ?? []).map((r) => [r.stimulus_id, r.response_data as Record<string, unknown>]));
		expect(byStim.get('s1')).toMatchObject({ rating: '1' });
		expect(byStim.get('s2')).toMatchObject({ rating: '3' });
		expect(byStim.get('s3')).toMatchObject({ rating: '_skipped_by_rule' });
	});
});
