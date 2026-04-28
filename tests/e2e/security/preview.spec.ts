import { test, expect } from '@playwright/test';

/**
 * S1 (CSP) + S4.1 (HSTS) — require a production build running on :4173.
 *
 * Pre-requisites: `npm run build && PORT=4173 npm run preview &` — if the
 * preview server is not up, these tests are skipped.
 */

const PREVIEW = 'http://localhost:4173';

test.describe('S1 / S4.1 — production preview headers', () => {
	test.beforeAll(async ({ request }) => {
		// Skip the whole describe if the preview server isn't reachable.
		try {
			const r = await request.get(`${PREVIEW}/`, { timeout: 2000 });
			test.skip(
				!r.ok() && r.status() !== 302,
				'Preview server not running on :4173 — skipping. Start with `npm run build && PORT=4173 npm run preview &`.'
			);
		} catch {
			test.skip(true, 'Preview server not running on :4173 — skipping.');
		}
	});

	test('S1.1: Content-Security-Policy is set with a nonce-bound script-src', async ({
		request
	}) => {
		const res = await request.get(`${PREVIEW}/admin/login`);
		expect(res.status()).toBe(200);
		const csp = res.headers()['content-security-policy'];
		expect(csp).toBeDefined();
		expect(csp).toMatch(/script-src\s+[^;]*'nonce-[^']+'/);
	});

	test('S1.2: script-src does NOT include unsafe-inline', async ({ request }) => {
		const res = await request.get(`${PREVIEW}/admin/login`);
		const csp = res.headers()['content-security-policy'];
		expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
	});

	test('S1.3: style-src is strict; style-src-attr allows unsafe-inline (for Tailwind)', async ({
		request
	}) => {
		const res = await request.get(`${PREVIEW}/admin/login`);
		const csp = res.headers()['content-security-policy'];
		// style-src (elements) should NOT have unsafe-inline.
		const styleSrcMatch = csp.match(/(?<!-\w)style-src\s+[^;]+/);
		expect(styleSrcMatch, `style-src should be present in CSP`).not.toBeNull();
		expect(styleSrcMatch![0]).not.toContain("'unsafe-inline'");
		// style-src-attr may allow unsafe-inline (inline style attributes).
		expect(csp).toMatch(/style-src-attr[^;]*'unsafe-inline'/);
	});

	test('S4.1: Strict-Transport-Security is set in preview', async ({ request }) => {
		const res = await request.get(`${PREVIEW}/admin/login`);
		const hsts = res.headers()['strict-transport-security'];
		expect(hsts).toBeDefined();
		expect(hsts).toMatch(/max-age=\d+/);
		expect(hsts).toMatch(/includeSubDomains/);
	});

	test('Every <script> tag in the rendered HTML carries a matching nonce', async ({ request }) => {
		const res = await request.get(`${PREVIEW}/admin/login`);
		const html = await res.text();
		const csp = res.headers()['content-security-policy'];
		const nonceMatch = csp.match(/'nonce-([^']+)'/);
		expect(nonceMatch).not.toBeNull();
		const nonce = nonceMatch![1];

		// Extract all <script ...> tags and verify nonce attr is present + matches.
		const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
		expect(scriptTags.length).toBeGreaterThan(0);
		for (const tag of scriptTags) {
			// External scripts (src=...) still must carry the nonce in strict-CSP setups.
			expect(tag).toContain(`nonce="${nonce}"`);
		}
	});
});
