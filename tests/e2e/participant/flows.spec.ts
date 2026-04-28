import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * P4.2 (branch rule), P5.3 (review filterEmpty), P8.1 (completion screen).
 *
 * P4.3 ("branch to completion") is not applicable: the schema's BranchRule
 * requires `nextPhaseSlug` to match an existing phase slug; there is no
 * "completion" phase type. Ending the survey is done by reaching the last
 * phase, not by a branch rule target.
 */

let supabase: SupabaseClient;
test.beforeAll(() => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
});

test.beforeEach(async () => {
	if (supabase) await supabase.from('rate_limits').delete().eq('endpoint', '/auth');
});

test.describe('P4.2 branch rule', () => {
	test('branchRule routes rating=1 to a non-sequential phase_B; rating=3 falls through to default next phase', async ({
		page
	}) => {
		// Custom fixture with 3 phases: p1 (with branch rule) → p2 (default next) or pB (branch target).
		const slug = `p42-${Date.now()}`;
		const cfg = {
			slug,
			version: 1,
			status: 'active',
			metadata: { title: { en: 'P4.2' }, languages: ['en'], defaultLanguage: 'en' },
			registration: {
				introduction: { title: { en: 'W' }, body: { en: 'R' } },
				fields: [
					{ id: 'age', type: 'number', label: { en: 'Age' }, required: true, validation: { min: 18, max: 120 } }
				]
			},
			tutorial: null,
			phases: [
				{
					id: 'p1',
					slug: 'main',
					type: 'stimulus-response',
					title: { en: 'Main' },
					responseWidgets: [
						{ id: 'rating', type: 'likert', label: { en: 'Rate' }, required: true, config: { min: 1, max: 5 } }
					],
					stimulusOrder: 'sequential',
					allowRevisit: true,
					allowMultipleResponses: false,
					branchRules: [
						{
							condition: { widgetId: 'rating', stimulusId: 's1', operator: 'equals', value: '1' },
							nextPhaseSlug: 'branch'
						}
					],
					completion: { title: { en: 'Done p1' }, body: { en: 'Moving on.' } }
				},
				{
					id: 'p2',
					slug: 'second',
					type: 'stimulus-response',
					title: { en: 'Second (default)' },
					responseWidgets: [
						{ id: 'r2', type: 'likert', label: { en: 'Rate 2' }, required: true, config: { min: 1, max: 5 } }
					],
					stimulusOrder: 'sequential',
					allowRevisit: true,
					allowMultipleResponses: false,
					completion: { title: { en: 'Done p2' }, body: { en: 'Done.' } }
				},
				{
					id: 'pB',
					slug: 'branch',
					type: 'stimulus-response',
					title: { en: 'Branch target' },
					responseWidgets: [
						{ id: 'rb', type: 'likert', label: { en: 'Rate B' }, required: true, config: { min: 1, max: 5 } }
					],
					stimulusOrder: 'sequential',
					allowRevisit: true,
					allowMultipleResponses: false,
					completion: { title: { en: 'Done pB' }, body: { en: 'Branch done.' } }
				}
			],
			stimuli: {
				type: 'text',
				source: 'external-urls',
				items: [{ id: 's1', type: 'text', label: { en: 'A' } }]
			},
			completion: { title: { en: 'All done' }, body: { en: 'Thanks.' }, feedbackWidgets: [] }
		};
		const seeded = await seedExperiment(cfg, { supabase });

		// Participant 1: rating=1 → should route to phase_B (/branch).
		const e1 = `p42a-${Date.now()}@example.com`;
		await page.goto(`/e/${seeded.slug}`);
		await page.getByLabel(/email/i).fill(e1);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('30');
		await page.getByRole('button', { name: /register/i }).click();
		await page.waitForURL(/\/main/);
		await page.getByRole('button', { name: '1' }).first().click();
		await page.getByRole('button', { name: /save/i }).click();
		// Click Next Phase in completion modal.
		await page.getByRole('button', { name: /next phase|next/i }).last().click();
		// Branch rule should send to /branch (not /second).
		await page.waitForURL(/\/e\/.+\/branch/, { timeout: 5000 });

		// Participant 2 on a new context: rating=3 → default next phase /second.
		const ctx2 = await page.context().browser()!.newContext();
		const page2 = await ctx2.newPage();
		const e2 = `p42b-${Date.now()}@example.com`;
		await page2.goto(`/e/${seeded.slug}`);
		await page2.getByLabel(/email/i).fill(e2);
		await page2.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page2.getByLabel(/age/i).fill('30');
		await page2.getByRole('button', { name: /register/i }).click();
		await page2.waitForURL(/\/main/);
		await page2.getByRole('button', { name: '3' }).first().click();
		await page2.getByRole('button', { name: /save/i }).click();
		await page2.getByRole('button', { name: /next phase|next/i }).last().click();
		await page2.waitForURL(/\/e\/.+\/second/, { timeout: 5000 });
		await ctx2.close();

		await supabase.from('experiments').delete().eq('id', seeded.id);
	});
});

test.describe('P5.3 review filterEmpty', () => {
	test('filterEmpty=true hides source responses whose widget values are all null', async ({
		page
	}) => {
		// Custom fixture: main phase has gatekeeper with noResponseValue="null"
		// (the literal string that filterEmpty treats as empty). Participant
		// clicks "No" on stimulus s2 → response_data = { rating: 'null' }. The
		// review phase's filterEmpty: true should hide s2's review item, so the
		// nav shows only 2 items (s1 and s3), not 3.
		const slug = `p53-${Date.now()}`;
		const cfg = {
			slug,
			version: 1,
			status: 'active',
			metadata: { title: { en: 'P5.3' }, languages: ['en'], defaultLanguage: 'en' },
			registration: {
				introduction: { title: { en: 'W' }, body: { en: 'R' } },
				fields: [
					{ id: 'age', type: 'number', label: { en: 'Age' }, required: true, validation: { min: 18, max: 120 } }
				]
			},
			tutorial: null,
			phases: [
				{
					id: 'p1',
					slug: 'main',
					type: 'stimulus-response',
					title: { en: 'Main' },
					gatekeeperQuestion: {
						text: { en: 'Q?' },
						yesLabel: { en: 'Yes' },
						noLabel: { en: 'No' },
						noResponseValue: 'null',
						skipToNext: true
					},
					responseWidgets: [
						{ id: 'rating', type: 'likert', label: { en: 'Rate' }, required: true, config: { min: 1, max: 5 } }
					],
					stimulusOrder: 'sequential',
					allowRevisit: true,
					allowMultipleResponses: false,
					completion: { title: { en: 'Done p1' }, body: { en: '.' } }
				},
				{
					id: 'p2',
					slug: 'review',
					type: 'review',
					title: { en: 'Review' },
					reviewConfig: {
						sourcePhase: 'p1',
						filterEmpty: true,
						replayMode: 'segment',
						responseWidgets: [
							{ id: 'conf', type: 'likert', label: { en: 'Confidence' }, required: true, config: { min: 1, max: 5 } }
						]
					},
					completion: { title: { en: 'Done p2' }, body: { en: '.' } }
				}
			],
			stimuli: {
				type: 'text',
				source: 'external-urls',
				items: [
					{ id: 's1', type: 'text', label: { en: 'A' } },
					{ id: 's2', type: 'text', label: { en: 'B' } },
					{ id: 's3', type: 'text', label: { en: 'C' } }
				]
			},
			completion: { title: { en: 'All' }, body: { en: '.' }, feedbackWidgets: [] }
		};
		const seeded = await seedExperiment(cfg, { supabase });

		const email = `p53-${Date.now()}@example.com`;
		await page.goto(`/e/${seeded.slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('30');
		await page.getByRole('button', { name: /register/i }).click();
		await page.waitForURL(/\/main/);

		// s1: Yes + rating=3 (kept)
		await page.locator('#gatekeeper-yes').click();
		await page.getByRole('button', { name: '3' }).first().click();
		await page.getByRole('button', { name: /^save$/i }).click();
		// s2: No → saves with rating='null' (filterEmpty hides)
		await page.locator('#gatekeeper-no').click();
		// s3: Yes + rating=5 (kept)
		await page.locator('#gatekeeper-yes').click();
		await page.getByRole('button', { name: '5' }).first().click();
		await page.getByRole('button', { name: /^save$/i }).click();

		await page.getByRole('button', { name: /next phase|next/i }).last().click();
		await page.waitForURL(/\/review/);

		// Review nav should have exactly 2 items (s1 and s3, not s2).
		// The progress bar shows "0 / 2" at entry.
		await expect(page.getByText(/0 \/ 2/)).toBeVisible();

		await supabase.from('experiments').delete().eq('id', seeded.id);
	});
});

test.describe('P8.1 completion screen', () => {
	test('reaching the final phase brings up /complete with the configured title and body', async ({
		page
	}) => {
		const cfg = makeFullFeatureConfig(`p81-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase });

		const email = `p81-${Date.now()}@example.com`;
		await page.goto(`/e/${seeded.slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('30');
		await page.getByLabel(/country/i).selectOption('us');
		await page.getByRole('button', { name: /register/i }).click();
		await page.waitForURL(/\/main/);

		// Main phase: 3 stimuli, rate each with 3, advance.
		for (let i = 0; i < 3; i++) {
			await page.locator('#gatekeeper-yes').click();
			await page.getByRole('button', { name: '3' }).first().click();
			await page.getByRole('button', { name: /save/i }).click();
		}
		// Next phase → review.
		await page.getByRole('button', { name: /next phase|next/i }).last().click();
		await page.waitForURL(/\/review/);

		// Review phase: 3 items, confidence=4 each.
		for (let i = 0; i < 3; i++) {
			await page.getByRole('button', { name: '4' }).first().click();
			await page.getByRole('button', { name: /^save$/i }).click();
			// Give the save roundtrip + client-side advance a moment to land.
			await page.waitForTimeout(200);
		}

		// After last review save, a "Finish experiment" button appears in the
		// completion modal — it navigates (hard reload) to /complete.
		await page.getByRole('button', { name: /finish|complete|done/i }).last().click();
		await page.waitForURL(/\/complete/, { timeout: 10000 });

		// Completion body/title from the fixture.
		await expect(page.getByText(/Thanks!/i)).toBeVisible();
		await expect(page.getByText(/Your session is complete/i)).toBeVisible();

		await supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('P8.2: feedback widget submits and persists to responses with phase_id=_completion', async ({
		page
	}) => {
		test.setTimeout(60_000);

		const cfg = makeFullFeatureConfig(`p82-${Date.now()}`);
		cfg.completion = cfg.completion ?? {
			title: { en: 'Thanks!' },
			body: { en: 'Done.' },
			feedbackWidgets: []
		};
		cfg.completion.feedbackWidgets = [
			{
				id: 'fb_comment',
				type: 'text',
				label: { en: 'Any comments?' },
				required: true
			}
		];
		const seeded = await seedExperiment(cfg, { supabase });

		try {
			const email = `p82-${Date.now()}@example.com`;
			await page.goto(`/e/${seeded.slug}`);
			await page.getByLabel(/email/i).fill(email);
			await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
			await page.getByLabel(/age/i).fill('30');
			await page.getByLabel(/country/i).selectOption('us');
			await page.getByRole('button', { name: /register/i }).click();
			await page.waitForURL(/\/main/);

			for (let i = 0; i < 3; i++) {
				await page.locator('#gatekeeper-yes').click();
				await page.getByRole('button', { name: '3' }).first().click();
				await page.getByRole('button', { name: /save/i }).click();
			}
			await page.getByRole('button', { name: /next phase|next/i }).last().click();
			await page.waitForURL(/\/review/);

			for (let i = 0; i < 3; i++) {
				await page.getByRole('button', { name: '4' }).first().click();
				await page.getByRole('button', { name: /^save$/i }).click();
				await page.waitForTimeout(200);
			}

			await page.getByRole('button', { name: /finish|complete|done/i }).last().click();
			await page.waitForURL(/\/complete/, { timeout: 10_000 });

			// Feedback form visible.
			await expect(page.getByText(/feedback/i).first()).toBeVisible();
			const feedback = 'The experiment was fine, thanks.';
			await page.getByLabel(/any comments/i).fill(feedback);
			await page.getByRole('button', { name: /submit feedback/i }).click();

			await expect(page.getByText(/thank you for your feedback/i)).toBeVisible({
				timeout: 10_000
			});

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
				.eq('phase_id', '_completion');
			expect(rows?.length).toBe(1);
			const saved = rows![0].response_data as Record<string, string>;
			expect(saved.fb_comment).toBe(feedback);
		} finally {
			await supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});
});
