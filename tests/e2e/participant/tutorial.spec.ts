import { test, expect } from '../fixtures';
import { seedExperiment } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import tutorialConfig from '../fixtures/tutorial-config.json' with { type: 'json' };

/**
 * P7 — Tutorial overlay, the Driver.js-based onboarding that runs once between
 * registration and the first phase.
 */

let experimentId: string;
let slug: string;
let supabase: SupabaseClient;

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
	const cfg: Record<string, unknown> = JSON.parse(JSON.stringify(tutorialConfig));
	cfg.slug = `${cfg.slug}-${Date.now()}`;
	const seeded = await seedExperiment(cfg, { supabase });
	experimentId = seeded.id;
	slug = seeded.slug;
});

test.afterAll(async () => {
	if (experimentId) await supabase.from('experiments').delete().eq('id', experimentId);
});

// Clear the Postgres-backed rate limiter before each test — several tests here
// hammer /auth and the default 20/min window leaks across parallel participant
// specs when the suite is run in one go.
test.beforeEach(async () => {
	if (!supabase) return;
	await supabase.from('rate_limits').delete().eq('endpoint', '/auth');
});

test.describe('P7 tutorial', () => {
	test('P7.1 + P7.3: tutorial welcome overlay appears after registration; Skip sends you to first phase', async ({
		page
	}) => {
		const email = `p7-skip-${Date.now()}@example.com`;

		// Register.
		await page.goto(`/e/${slug}`);
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('30');
		await page.getByRole('button', { name: /register/i }).click();

		// Tutorial welcome shows on /e/<slug>/tutorial.
		await page.waitForURL(/\/e\/.+\/tutorial/);
		await expect(page.getByRole('heading', { name: /tutorial welcome/i })).toBeVisible();

		// Skip button is visible because allowSkip=true.
		const skipBtn = page.getByRole('button', { name: /skip/i });
		await expect(skipBtn).toBeVisible();

		await skipBtn.click();

		// Skipping sends the participant straight to the first phase.
		await page.waitForURL(/\/e\/.+\/main/, { timeout: 5000 });
		await expect(page.locator('#gatekeeper-yes')).toBeVisible();
	});

	test('P7.2: tutorial click-gate blocks Next until the target is clicked', async ({
		page,
		ctx
	}) => {
		test.setTimeout(60_000);

		// Build a one-off tutorial config with a click-gate on step 1 so we can
		// observe the validation state without disturbing the shared P7 fixture.
		const cfg: Record<string, unknown> = JSON.parse(JSON.stringify(tutorialConfig));
		cfg.slug = `e2e-tutorial-clickgate-${Date.now()}`;
		const tutorial = cfg.tutorial as Record<string, unknown>;
		tutorial.allowSkip = false;
		tutorial.steps = [
			{
				id: 'step1',
				targetSelector: '#gatekeeper-yes',
				title: { en: 'Step 1' },
				body: { en: 'Click the Yes button.' },
				position: 'bottom',
				validation: { type: 'click', target: '#gatekeeper-yes' }
			}
		];
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase });

		try {
			const email = `p72-${Date.now()}@example.com`;
			await page.goto(`/e/${seeded.slug}`);
			await page.getByLabel(/email/i).fill(email);
			await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
			await page.getByLabel(/age/i).fill('30');
			await page.getByRole('button', { name: /register/i }).click();
			await page.waitForURL(/\/e\/.+\/tutorial/);

			// Welcome modal → begin tutorial.
			await page.getByRole('button', { name: /begin tutorial/i }).click();

			// Driver.js popover renders. The Next/Done button carries
			// data-validation-blocked while click validation is unsatisfied.
			const doneBtn = page.locator(
				'.driver-popover-next-btn, .driver-popover-done-btn'
			).first();
			await expect(doneBtn).toBeVisible();
			await expect(doneBtn).toHaveAttribute('data-validation-blocked', 'true');

			// Click the gated target — the validation handler attached by
			// setupValidation() removes the blocked attribute.
			await page.locator('#gatekeeper-yes').click();
			await expect(doneBtn).not.toHaveAttribute('data-validation-blocked', 'true');

			// Now Next/Done is clickable; clicking advances and (since this is
			// the only step) destroys the driver, surfacing the completion modal.
			await doneBtn.click();
			await expect(
				page.getByRole('heading', { name: /tutorial done/i })
			).toBeVisible({ timeout: 5000 });
		} finally {
			await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});

	test('P7.4: returning-participant login path returns { found: true } and does not route back through /tutorial', async ({
		page,
		request
	}) => {
		// Register once via the UI, skip the tutorial.
		const email = `p7-return-${Date.now()}@example.com`;
		await page.goto(`/e/${slug}`);
		await expect(page.getByLabel(/email/i)).toBeVisible();
		await page.getByLabel(/email/i).fill(email);
		await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
		await page.getByLabel(/age/i).fill('30');
		await page.getByRole('button', { name: /register/i }).click();
		await page.waitForURL(/\/e\/.+\/tutorial/);
		await page.getByRole('button', { name: /skip/i }).click();
		await page.waitForURL(/\/e\/.+\/main/);

		// Hit /auth directly as a returning participant — this is exactly what
		// the entry page would do when the email is resubmitted. The response
		// must say { found: true } and include the first-phase URL (NOT a
		// tutorial URL). That's the behaviour that makes the tutorial a
		// once-per-registration experience.
		const res = await request.post(`/e/${slug}/auth`, {
			headers: { Origin: 'http://localhost:5173' },
			data: { action: 'login', email }
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.found).toBe(true);
		// nextChunkUrl is only set for chunked experiments. For this fixture
		// there's no chunking, so the client falls back to firstPhaseUrl(), which
		// is the main phase path. Either way, it's NOT /tutorial.
		if (body.nextChunkUrl) {
			expect(body.nextChunkUrl).not.toContain('/tutorial');
		}
	});
});
