import { test, expect } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * S2 — Rate limiter (Postgres-backed, migration 016).
 *
 * `/auth` is capped at 20 POSTs per 60-second window per client IP. We fire
 * 21 in quick succession; the 21st must be 429. Then we clear the window via
 * the rate_limits table (simulating a minute passing) and verify the next
 * request goes through.
 */

test.describe('S2 rate limiter', () => {
	test('21st /auth POST within the window returns 429; wiping the window restores access', async ({
		request
	}) => {
		const sb: SupabaseClient = createClient(
			process.env.PUBLIC_SUPABASE_URL!,
			process.env.SUPABASE_SERVICE_ROLE_KEY!
		);
		// Seed a real experiment so /auth doesn't 404 before it can rate-limit.
		const cfg = makeFullFeatureConfig(`s2-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: sb, status: 'active' });

		// Start with a clean rate-limit window.
		await sb.from('rate_limits').delete().eq('endpoint', '/auth');

		// Fire 21 requests (with matching Origin so CSRF check passes).
		const statuses: number[] = [];
		for (let i = 0; i < 21; i++) {
			const res = await request.post(`/e/${seeded.slug}/auth`, {
				headers: { Origin: 'http://localhost:5173' },
				data: { action: 'login', email: `s2-${i}-${Date.now()}@example.com` }
			});
			statuses.push(res.status());
		}

		// First 20 allowed (status not 429). 21st must be 429.
		const pre = statuses.slice(0, 20);
		const last = statuses[20];
		expect(pre.every((s) => s !== 429), `pre-limit statuses: ${pre.join(',')}`).toBe(true);
		expect(last).toBe(429);

		// Wipe the window and expect the next request to go through.
		await sb.from('rate_limits').delete().eq('endpoint', '/auth');
		const recovery = await request.post(`/e/${seeded.slug}/auth`, {
			headers: { Origin: 'http://localhost:5173' },
			data: { action: 'login', email: `s2-recovery-${Date.now()}@example.com` }
		});
		expect(recovery.status()).not.toBe(429);

		await sb.from('experiments').delete().eq('id', seeded.id);
		await sb.from('rate_limits').delete().eq('endpoint', '/auth');
	});
});
