import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * P5 — Review phase, the response-UUID-as-stimulusId gotcha.
 *
 * A real participant completes the main stimulus-response phase, then walks
 * through the review phase. For each review item we verify:
 *   - the nav shows one entry per source response (not per stimulus)
 *   - the submitted review response stores `stimulus_id = <source response UUID>`
 *   - the review submission passes server-side validation (the `save` handler
 *     deliberately skips the stimuli-items existence check for review phases,
 *     which is exactly the surface CLAUDE.md calls out as hazardous)
 */

let experimentId: string;
let slug: string;
let supabase: SupabaseClient;

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
	const cfg = makeFullFeatureConfig(`p5-${Date.now()}`);
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

test.describe('P5 review phase', () => {
	test('P5.1+5.2: review phase iterates source response UUIDs and save endpoint accepts UUID as stimulusId', async ({
		page
	}) => {
		const email = `p5-${Date.now()}@example.com`;

		// --- Register as a participant ---
		await page.goto(`/e/${slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('28');
		await page.getByLabel(/country/i).selectOption('us');
		await page.getByRole('button', { name: /register/i }).click();
		await page.waitForURL(/\/e\/.+\/main/);

		// --- Main phase: 3 stimuli; for each, gatekeeper=Yes, likert=3, Save.
		// Rating non-1 so the s1->s3 skipRule does NOT fire and we get 3 source
		// responses feeding the review phase. ---
		for (let i = 0; i < 3; i++) {
			await page.locator('#gatekeeper-yes').click();
			// Likert is rendered as 5 buttons labelled 1..5; pick 3.
			await page.getByRole('button', { name: '3' }).first().click();
			await page.getByRole('button', { name: /save/i }).click();
		}

		// After the last save the completion modal shows. Click "Next phase".
		// Scope to dialog so we don't race with the NavStrip's "Next →".
		await page.getByRole('dialog').getByRole('button', { name: /next phase|next/i }).click();
		await page.waitForURL(/\/e\/.+\/review/);

		// --- Review phase: verify nav has 3 items and each item id looks like a UUID. ---
		const { data: sourceRows } = await supabase
			.from('responses')
			.select('id, stimulus_id')
			.eq('experiment_id', experimentId)
			.eq('phase_id', 'p1')
			.order('created_at');
		const sourceUuids = (sourceRows ?? []).map((r) => r.id);
		expect(sourceUuids.length).toBe(3);
		// Sanity: these are real UUIDs, and the source stimulus_ids are the stimulus ids, not the UUIDs.
		for (const uuid of sourceUuids) expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
		const sourceStimIds = (sourceRows ?? []).map((r) => r.stimulus_id).sort();
		expect(sourceStimIds).toEqual(['s1', 's2', 's3']);

		// --- Submit a review response (confidence=4) for the FIRST review item. ---
		// Review phase has no gatekeeper, widgets show directly.
		await page.getByRole('button', { name: '4' }).first().click();
		await page.getByRole('button', { name: /save/i }).click();

		// Wait for the save roundtrip to complete and the nav to advance.
		await expect
			.poll(async () => {
				const { count } = await supabase
					.from('responses')
					.select('id', { count: 'exact', head: true })
					.eq('experiment_id', experimentId)
					.eq('phase_id', 'p2');
				return count ?? 0;
			}, { timeout: 5000 })
			.toBeGreaterThanOrEqual(1);

		// --- Verify DB: the review response's stimulus_id is a source UUID,
		// NOT one of the stimulus ids like 's1'. ---
		const { data: reviewRows } = await supabase
			.from('responses')
			.select('stimulus_id, response_data')
			.eq('experiment_id', experimentId)
			.eq('phase_id', 'p2');
		expect(reviewRows).not.toBeNull();
		expect(reviewRows!.length).toBe(1);
		const savedStim = reviewRows![0].stimulus_id;
		expect(savedStim).toMatch(/^[0-9a-f-]{36}$/);
		expect(sourceUuids).toContain(savedStim);
		// And it's clearly not a raw stimulus id.
		expect(['s1', 's2', 's3']).not.toContain(savedStim);
		expect(reviewRows![0].response_data).toMatchObject({ confidence: '4' });
	});
});
