import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * S3 — CSRF origin check for +server.ts API endpoints (/auth, /save, /upload,
 * /export). SvelteKit form actions already have built-in CSRF protection, so
 * this only covers the hand-written API endpoints.
 *
 * In dev, hooks.server.ts allows POSTs with no Origin header (Postman/curl),
 * but rejects mismatched Origins with 403 "Cross-origin request blocked".
 */

test.describe('CSRF origin check (S3)', () => {
	let experimentId: string | null = null;
	let slug: string | null = null;

	test.beforeAll(async () => {
		const cfg = makeFullFeatureConfig(`csrf-${Date.now()}`);
		const seeded = await seedExperiment(cfg);
		experimentId = seeded.id;
		slug = seeded.slug;
	});

	test.afterAll(async ({}, testInfo) => {
		if (!experimentId) return;
		const { createClient } = await import('@supabase/supabase-js');
		const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
		await sb.from('experiments').delete().eq('id', experimentId);
	});

	test('S3.1: cross-origin POST to /auth is rejected (403)', async ({ request }) => {
		const res = await request.post(`/e/${slug}/auth`, {
			headers: { Origin: 'https://evil.example' },
			data: { email: 'x@y.com' }
		});
		expect(res.status()).toBe(403);
	});

	test('S3.2: POST with no Origin header is allowed in dev (not 403)', async ({ request }) => {
		// Playwright sets Origin on cross-origin fetches; request.post from the
		// baseURL by default omits Origin for same-origin relative calls — but
		// we explicitly clear it to make intent obvious.
		const res = await request.post(`/e/${slug}/auth`, {
			headers: { Origin: '' },
			data: { email: 'no-origin@example.com' }
		});
		// 403 means the CSRF guard blocked it. Anything else means it reached
		// the handler; the handler may still 400 on bad inputs — that's fine,
		// we only care it wasn't 403.
		expect(res.status()).not.toBe(403);
	});

	test('S3.3: POST with matching Origin is allowed', async ({ request, baseURL }) => {
		const res = await request.post(`/e/${slug}/auth`, {
			headers: { Origin: baseURL ?? 'http://localhost:5173' },
			data: { email: 'matching-origin@example.com' }
		});
		expect(res.status()).not.toBe(403);
	});
});
