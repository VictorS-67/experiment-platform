import { test, expect } from '@playwright/test';

/**
 * HMR smoke — prior sessions saw a dev-only hydration error
 * `__SVELTEKIT_EXPERIMENTAL_USE_TRANSFORM_ERROR__ is not defined` after vite
 * re-optimized dependencies mid-session. Confirm production builds don't
 * carry that bug: load a few pages on the :4173 preview, listen for page
 * errors, and assert none surface.
 */

const PREVIEW = 'http://localhost:4173';

test.describe('HMR smoke on preview', () => {
	test.beforeAll(async ({ request }) => {
		try {
			const r = await request.get(`${PREVIEW}/`, { timeout: 2000 });
			test.skip(
				!r.ok() && r.status() !== 302,
				'Preview server not running on :4173 — skipping.'
			);
		} catch {
			test.skip(true, 'Preview server not running on :4173 — skipping.');
		}
	});

	test('admin login and participant entry pages hydrate without pageerror', async ({ browser }) => {
		const context = await browser.newContext({ baseURL: PREVIEW });
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await page.goto('/admin/login', { waitUntil: 'networkidle' });
		// The admin login form should render after hydration.
		await expect(page.getByRole('heading', { name: /admin login/i })).toBeVisible();

		// Participant entry for a non-existent slug → 404. Still exercises
		// the layout/hydration path without needing a seeded experiment.
		const r = await page.goto('/e/definitely-does-not-exist', { waitUntil: 'networkidle' });
		expect(r?.status()).toBe(404);

		// No hydration error.
		const hydrationErr = errors.find((e) =>
			/__SVELTEKIT_EXPERIMENTAL|hydrat|ReferenceError/i.test(e)
		);
		expect(hydrationErr, `pageerrors: ${errors.join(' | ')}`).toBeUndefined();
		await context.close();
	});
});
