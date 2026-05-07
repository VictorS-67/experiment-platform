import { test, expect } from '../fixtures';
import { seedExperiment } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import tutorialConfig from '../fixtures/tutorial-config.json' with { type: 'json' };

/**
 * P7.5 — Defensive test for the tutorial popover overlay on narrow viewports.
 *
 * Background: when the stimulus player is tall enough to leave no room for
 * the popover on any side, Driver.js falls back to a viewport-centred,
 * arrow-less placement that visually overlaps the player's scrubber. We
 * detect that fallback via Driver.js's `driver-popover-arrow-none` class
 * and pin the popover to the top of the viewport instead, so it overlaps
 * only the (passive) video frame.
 *
 * If Driver.js renames its arrow-none class in a future release, our
 * detection silently breaks and the popover lands wrong. This spec catches
 * that regression by asserting the popover ends up at the viewport top
 * (rather than viewport-centred) under the conditions that trigger the
 * fallback.
 */

let supabase: SupabaseClient;

test.beforeAll(async () => {
	supabase = createClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
});

test.beforeEach(async () => {
	if (!supabase) return;
	await supabase.from('rate_limits').delete().eq('endpoint', '/auth');
});

test.describe('P7.5 tutorial popover on narrow viewport', () => {
	test('popover targeting #stimulus-player lands at viewport top, not centred over the scrubber', async ({
		page,
		ctx
	}) => {
		test.setTimeout(60_000);

		// Build a one-off config: one tutorial step targeting #stimulus-player
		// with position=bottom (the configuration that exposes the bug). No
		// skip button, so the participant must reach the popover render path.
		const cfg: Record<string, unknown> = JSON.parse(JSON.stringify(tutorialConfig));
		cfg.slug = `e2e-tutorial-narrow-${Date.now()}`;
		const tutorial = cfg.tutorial as Record<string, unknown>;
		tutorial.allowSkip = false;
		tutorial.steps = [
			{
				id: 'stim-step',
				targetSelector: '#stimulus-player',
				title: { en: 'Watch the stimulus' },
				body: { en: 'This is the stimulus area.' },
				position: 'bottom'
			}
		];
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase });

		try {
			// Narrow viewport that reproduces the user's reported failure mode
			// (stimulus player ≥60% of viewport height/width, so no side has
			// room for the popover). Width 1024 / height 720 matches typical
			// laptop / iPad-landscape sizes.
			await page.setViewportSize({ width: 1024, height: 720 });

			const email = `p75-${Date.now()}@example.com`;
			await page.goto(`/e/${seeded.slug}`);
			await page.getByLabel(/email/i).fill(email);
			await page.getByRole('button', { name: /continue|submit|next/i }).first().click();
			await page.getByLabel(/age/i).fill('30');
			await page.getByRole('button', { name: /register/i }).click();
			await page.waitForURL(/\/e\/.+\/tutorial/);

			// Force #stimulus-player to be tall AND wide enough that the
			// popover can't fit on any side — the precondition for Driver.js's
			// arrow-none fallback. The text stimulus is otherwise small, so we
			// inflate it to roughly mimic a 60vh video.
			await page.addStyleTag({
				content: '#stimulus-player { min-height: 460px !important; min-width: 720px !important; }'
			});

			// Begin the tutorial.
			await page.getByRole('button', { name: /begin tutorial/i }).click();

			// Wait for the popover to render.
			const popover = page.locator('.driver-popover');
			await expect(popover).toBeVisible();

			// Confirm the precondition: Driver.js gave up on side placement
			// (arrow-none class set). If this assertion fails, the test
			// scenario isn't reproducing the failure mode and we should
			// re-tune the player size or viewport.
			const arrow = page.locator('.driver-popover-arrow');
			await expect(arrow).toHaveClass(/driver-popover-arrow-none/);

			// onHighlighted sets data-tutorial-ready after running our
			// reposition. The CSS readiness gate (see TutorialOverlay's
			// <style>) keys popover visibility off this attribute, so when
			// it's set, the popover is at its final position. Wait for it
			// before reading layout — otherwise we'd see Driver.js's
			// initial (pre-reposition) placement.
			await expect(popover).toHaveAttribute('data-tutorial-ready', 'true');

			// The defensive assertion: our overlay logic kicks in and pins
			// the popover to the top of the viewport (within 32 px — covers
			// our 8 px padding + a margin for the popover element's own
			// padding/border). If Driver.js renames `arrow-none` and our
			// detection breaks, the popover stays viewport-centred and y
			// jumps to ~250 px+, failing this check.
			const box = await popover.boundingBox();
			expect(box).not.toBeNull();
			expect(box!.y).toBeLessThanOrEqual(32);
		} finally {
			await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
		}
	});
});
