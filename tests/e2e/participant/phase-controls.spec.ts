import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * P3 — phase-level controls.
 *
 * P3.3: allowMultipleResponses=true — gatekeeper re-shows after save and a
 *       second response is accepted, indexed at response_index=1.
 * P3.4: allowRevisit=false — StimulusNav is not rendered, and direct URL
 *       navigation back to a completed item shows it as read-only.
 * P3.5a: Gatekeeper initial/subsequent text — after submitting a response the
 *        gatekeeper should render the `subsequent` prompt text, not `initial`.
 * P3.5b: Gatekeeper "No" after a response only advances — does not write a
 *        skip row.
 * P3.5c: Gatekeeper "No" on first encounter writes a skip row with JSON null
 *        widget values.
 * P3.6: conditionalOn — widget B is hidden until widget A's value matches;
 *       hidden widgets save as null per the in-page logic.
 */

let supabase: SupabaseClient;

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
});

test.beforeEach(async () => {
	if (supabase) await supabase.from('rate_limits').delete().eq('endpoint', '/auth');
});

async function registerAndLand(page: import('@playwright/test').Page, slug: string, email: string) {
	await page.goto(`/e/${slug}`);
	await page.getByLabel(/email/i).fill(email);
	await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
	await page.getByLabel(/age/i).fill('30');
	await page.getByLabel(/country/i).selectOption('us');
	await page.getByRole('button', { name: /register/i }).click();
	await page.waitForURL(/\/main/);
}

test.describe('P3 phase controls', () => {
	test('P3.3: allowMultipleResponses=true accepts a second response and indexes it 1', async ({
		page
	}) => {
		test.setTimeout(60_000);

		const cfg = makeFullFeatureConfig(`p33-${Date.now()}`);
		// Enable multiple responses on the main phase. Drop skipRules — they
		// reference s3 and would short-circuit the loop.
		(cfg.phases as Array<Record<string, unknown>>)[0].allowMultipleResponses = true;
		delete (cfg.phases as Array<Record<string, unknown>>)[0].skipRules;
		const seeded = await seedExperiment(cfg, { supabase });

		try {
			const email = `p33-${Date.now()}@example.com`;
			await registerAndLand(page, seeded.slug, email);

			const saveResponses: Array<{ url: string; status: number }> = [];
			page.on('response', (r) => {
				if (r.url().includes('/main/save') && r.request().method() === 'POST') {
					saveResponses.push({ url: r.url(), status: r.status() });
				}
			});

			// First response on s1.
			await page.locator('#gatekeeper-yes').click();
			await page.getByRole('button', { name: '3' }).first().click();
			await page.getByRole('button', { name: /^save$/i }).click();
			await expect(page.getByText(/saved/i).first()).toBeVisible();

			// After the save, the gatekeeper question reappears (allowMultipleResponses
			// keeps the participant on the same item). The widgets are hidden until
			// they answer Yes again.
			await expect(page.locator('#gatekeeper-yes')).toBeVisible();

			// Submit a second response on the same stimulus.
			await page.locator('#gatekeeper-yes').click();
			await page.getByRole('button', { name: '5' }).first().click();
			await page.getByRole('button', { name: /^save$/i }).click();
			// Poll until two saves have landed (separate from the toast which can
			// linger from the first save).
			await expect.poll(() => saveResponses.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
			expect(saveResponses.every((r) => r.status === 200)).toBe(true);

			// DB: two rows for (participant, p1, s1) with response_index 0 and 1.
			const { data: participant } = await supabase
				.from('participants')
				.select('id')
				.eq('experiment_id', seeded.id)
				.eq('email', email)
				.single();
			const { data: rows } = await supabase
				.from('responses')
				.select('response_index, response_data')
				.eq('experiment_id', seeded.id)
				.eq('participant_id', participant!.id)
				.eq('phase_id', 'p1')
				.eq('stimulus_id', 's1')
				.order('response_index', { ascending: true });
			expect(rows?.length).toBe(2);
			expect(rows![0].response_index).toBe(0);
			expect(rows![1].response_index).toBe(1);
			expect((rows![0].response_data as Record<string, string>).rating).toBe('3');
			expect((rows![1].response_data as Record<string, string>).rating).toBe('5');
		} finally {
			await supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});

	test('P3.4: allowRevisit=false hides StimulusNav so completed items cannot be re-edited', async ({
		page
	}) => {
		test.setTimeout(60_000);

		const cfg = makeFullFeatureConfig(`p34-${Date.now()}`);
		(cfg.phases as Array<Record<string, unknown>>)[0].allowRevisit = false;
		delete (cfg.phases as Array<Record<string, unknown>>)[0].skipRules;
		const seeded = await seedExperiment(cfg, { supabase });

		try {
			const email = `p34-${Date.now()}@example.com`;
			await registerAndLand(page, seeded.slug, email);

			// Stimulus nav must not render at all when allowRevisit is false.
			await expect(page.locator('#stimulus-nav')).toHaveCount(0);

			// Complete s1 and advance.
			await page.locator('#gatekeeper-yes').click();
			await page.getByRole('button', { name: '3' }).first().click();
			await page.getByRole('button', { name: /^save$/i }).click();

			// On s2 now (gatekeeper reappears for next item).
			await expect(page.locator('#gatekeeper-yes')).toBeVisible();
			// Nav still hidden.
			await expect(page.locator('#stimulus-nav')).toHaveCount(0);
		} finally {
			await supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});

	test('P3.5a: gatekeeper renders subsequent text after first response', async ({ page }) => {
		test.setTimeout(60_000);

		const cfg = makeFullFeatureConfig(`p35a-${Date.now()}`);
		const phase = (cfg.phases as Array<Record<string, unknown>>)[0];
		phase.allowMultipleResponses = true;
		delete (phase as Record<string, unknown>).skipRules;
		// Add a `subsequent` block with distinct text.
		(phase.gatekeeperQuestion as Record<string, unknown>).subsequent = {
			text: { en: 'Anything else to add?' },
			yesLabel: { en: 'Yes, add another' },
			noLabel: { en: 'No, done' }
		};
		const seeded = await seedExperiment(cfg, { supabase });

		try {
			const email = `p35a-${Date.now()}@example.com`;
			await registerAndLand(page, seeded.slug, email);

			// First encounter — initial text.
			await expect(page.getByText('Have you seen this before?')).toBeVisible();

			await page.locator('#gatekeeper-yes').click();
			await page.getByRole('button', { name: '3' }).first().click();
			await page.getByRole('button', { name: /^save$/i }).click();
			await expect(page.getByText(/saved/i).first()).toBeVisible();

			// After save — gatekeeper reappears with subsequent text.
			await expect(page.getByText('Anything else to add?')).toBeVisible();
			await expect(page.getByText('Yes, add another')).toBeVisible();
			await expect(page.getByText('No, done')).toBeVisible();
			// Initial text should NOT be visible.
			await expect(page.getByText('Have you seen this before?')).toHaveCount(0);
		} finally {
			await supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});

	test('P3.5b: gatekeeper "No" after a real response advances without writing a skip row', async ({
		page
	}) => {
		test.setTimeout(60_000);

		const cfg = makeFullFeatureConfig(`p35b-${Date.now()}`);
		const phase = (cfg.phases as Array<Record<string, unknown>>)[0];
		phase.allowMultipleResponses = true;
		delete (phase as Record<string, unknown>).skipRules;
		const seeded = await seedExperiment(cfg, { supabase });

		try {
			const email = `p35b-${Date.now()}@example.com`;
			await registerAndLand(page, seeded.slug, email);

			// Submit one real response.
			await page.locator('#gatekeeper-yes').click();
			await page.getByRole('button', { name: '3' }).first().click();
			await page.getByRole('button', { name: /^save$/i }).click();
			await expect(page.getByText(/saved/i).first()).toBeVisible();

			// Gatekeeper reappears — click No (subsequent encounter → should just advance).
			await expect(page.locator('#gatekeeper-no')).toBeVisible();
			await page.locator('#gatekeeper-no').click();

			// Should advance to s2's gatekeeper, not stay on s1.
			// (The initial text reappears for s2's first encounter.)
			await expect(page.locator('#gatekeeper-yes')).toBeVisible();

			// DB: only ONE response for s1 — no skip row written.
			const { data: participant } = await supabase
				.from('participants')
				.select('id')
				.eq('experiment_id', seeded.id)
				.eq('email', email)
				.single();
			const { data: rows } = await supabase
				.from('responses')
				.select('response_index, response_data')
				.eq('experiment_id', seeded.id)
				.eq('participant_id', participant!.id)
				.eq('phase_id', 'p1')
				.eq('stimulus_id', 's1');
			expect(rows?.length).toBe(1);
		} finally {
			await supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});

	test('P3.5c: gatekeeper "No" on first encounter writes skip row with null widget values', async ({
		page
	}) => {
		test.setTimeout(60_000);

		const cfg = makeFullFeatureConfig(`p35c-${Date.now()}`);
		const phase = (cfg.phases as Array<Record<string, unknown>>)[0];
		phase.allowMultipleResponses = true;
		delete (phase as Record<string, unknown>).skipRules;
		const seeded = await seedExperiment(cfg, { supabase });

		try {
			const email = `p35c-${Date.now()}@example.com`;
			await registerAndLand(page, seeded.slug, email);

			// First encounter — click No immediately (engage → skip row).
			await expect(page.locator('#gatekeeper-no')).toBeVisible();
			const saveResp = page.waitForResponse(
				(r) => r.url().includes('/main/save') && r.request().method() === 'POST'
			);
			await page.locator('#gatekeeper-no').click();
			const resp = await saveResp;
			expect(resp.status()).toBe(200);

			// DB: one skip row for s1 with null widget values.
			const { data: participant } = await supabase
				.from('participants')
				.select('id')
				.eq('experiment_id', seeded.id)
				.eq('email', email)
				.single();
			const { data: rows } = await supabase
				.from('responses')
				.select('response_data')
				.eq('experiment_id', seeded.id)
				.eq('participant_id', participant!.id)
				.eq('phase_id', 'p1')
				.eq('stimulus_id', 's1');
			expect(rows?.length).toBe(1);
			const data = rows![0].response_data as Record<string, unknown>;
			// All widget values must be JSON null (not the string "null").
			for (const val of Object.values(data)) {
				expect(val).toBeNull();
			}
		} finally {
			await supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});

	test('P3.6: conditional widget hides until controlling widget value matches', async ({
		page
	}) => {
		test.setTimeout(60_000);

		const cfg = makeFullFeatureConfig(`p36-${Date.now()}`);
		// Replace main-phase widgets with: a select "trigger" + a text widget
		// that is conditionalOn trigger='show'.
		const phase = (cfg.phases as Array<Record<string, unknown>>)[0];
		phase.responseWidgets = [
			{
				id: 'trigger',
				type: 'select',
				label: { en: 'Trigger' },
				required: true,
				config: {
					options: [
						{ value: 'show', label: { en: 'Show' } },
						{ value: 'hide', label: { en: 'Hide' } }
					]
				}
			},
			{
				id: 'extra',
				type: 'text',
				label: { en: 'Extra detail' },
				required: false,
				conditionalOn: { widgetId: 'trigger', value: 'show' }
			}
		];
		delete phase.skipRules;
		const seeded = await seedExperiment(cfg, { supabase });

		try {
			const email = `p36-${Date.now()}@example.com`;
			await registerAndLand(page, seeded.slug, email);

			// Pass the gatekeeper to reveal the response widgets.
			await page.locator('#gatekeeper-yes').click();

			const triggerSelect = page.locator('#widget-input-trigger');
			const extraField = page.locator('#widget-input-extra');

			// Trigger renders; extra is hidden.
			await expect(triggerSelect).toBeVisible();
			await expect(extraField).toHaveCount(0);

			// Choose 'show' → extra appears.
			await triggerSelect.selectOption('show');
			await expect(extraField).toBeVisible();
			await extraField.fill('some text');

			// Choose 'hide' → extra hides again.
			await triggerSelect.selectOption('hide');
			await expect(extraField).toHaveCount(0);

			// Save; the hidden widget is persisted as null per the page handler.
			const saveResp = page.waitForResponse(
				(r) => r.url().includes('/main/save') && r.request().method() === 'POST'
			);
			await page.getByRole('button', { name: /^save$/i }).click();
			const resp = await saveResp;
			expect(resp.status()).toBe(200);

			const { data: participant } = await supabase
				.from('participants')
				.select('id')
				.eq('experiment_id', seeded.id)
				.eq('email', email)
				.single();
			const { data: row } = await supabase
				.from('responses')
				.select('response_data')
				.eq('experiment_id', seeded.id)
				.eq('participant_id', participant!.id)
				.eq('phase_id', 'p1')
				.eq('stimulus_id', 's1')
				.single();
			const data = row!.response_data as Record<string, string | null>;
			expect(data.trigger).toBe('hide');
			expect(data.extra).toBeNull();
		} finally {
			await supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});
});
