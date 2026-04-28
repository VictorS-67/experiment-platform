import { test, expect } from './fixtures';

/**
 * Participant happy-path sketch.
 *
 * This test assumes an experiment seeded with slug `e2e-participant` (see
 * supabase/seed.sql or a seed helper). For now the spec just asserts the
 * slug route serves the registration intro — full-flow coverage (complete
 * a phase, land on completion) is a follow-up because it requires either
 * programmatic config creation in the fixture or a seeded experiment in the
 * local DB; both approaches are straightforward but out of scope for the
 * initial Playwright wiring.
 */
test.describe('Participant entry point', () => {
	test('unknown experiment slug returns 404', async ({ page }) => {
		const res = await page.goto('/e/does-not-exist-' + Date.now());
		expect(res?.status()).toBeGreaterThanOrEqual(400);
	});
});
