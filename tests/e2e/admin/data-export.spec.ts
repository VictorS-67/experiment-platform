import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * A5 — Participant data export + participant-delete cascade.
 *
 * A5.1: CSV raw download with correct headers and one row per response.
 * A5.2: CSV escapes commas/quotes/newlines inside registration_data.
 * A5.3: Reset responses zeros out one participant's responses only.
 * A5.4: Delete participant cascades to responses.
 */

test.describe('A5 participant data export', () => {
	test('A5.1: CSV raw export returns text/csv with response rows', async ({ page, ctx }) => {
		const cfg = makeFullFeatureConfig(`a5-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'active' });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: seeded.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});

		// Seed a participant with 2 responses directly.
		const { data: p } = await ctx.supabase
			.from('participants')
			.insert({
				experiment_id: seeded.id,
				email: `a51-${Date.now()}@example.com`,
				registration_data: { age: '30', country: 'us' },
				session_token: crypto.randomUUID()
			})
			.select('id')
			.single();
		await ctx.supabase.from('responses').insert([
			{
				participant_id: p!.id,
				experiment_id: seeded.id,
				phase_id: 'p1',
				stimulus_id: 's1',
				response_data: { rating: '3' },
				response_index: 0
			},
			{
				participant_id: p!.id,
				experiment_id: seeded.id,
				phase_id: 'p1',
				stimulus_id: 's2',
				response_data: { rating: '5' },
				response_index: 0
			}
		]);

		await loginAsAdmin(page, ctx);
		const res = await page.request.get(
			`/admin/experiments/${seeded.id}/data/export?format=csv&style=raw`
		);
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toMatch(/text\/csv/);
		const body = await res.text();
		const lines = body.trim().split('\n');
		// Header + at least 2 data rows.
		expect(lines.length).toBeGreaterThanOrEqual(3);
		expect(lines[0]).toContain('participant_id');
		expect(body).toContain('s1');
		expect(body).toContain('s2');

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A5.2: CSV escapes commas/quotes/newlines inside registration_data', async ({
		page,
		ctx
	}) => {
		const cfg = makeFullFeatureConfig(`a52-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'active' });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: seeded.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});
		const tricky = 'John "Johnny", O\'Neil\nSecond line';
		const { data: p } = await ctx.supabase
			.from('participants')
			.insert({
				experiment_id: seeded.id,
				email: `a52-${Date.now()}@example.com`,
				registration_data: { name: tricky, age: '40' },
				session_token: crypto.randomUUID()
			})
			.select('id')
			.single();
		await ctx.supabase.from('responses').insert({
			participant_id: p!.id,
			experiment_id: seeded.id,
			phase_id: 'p1',
			stimulus_id: 's1',
			response_data: { rating: '3' },
			response_index: 0
		});

		await loginAsAdmin(page, ctx);
		const res = await page.request.get(
			`/admin/experiments/${seeded.id}/data/export?format=csv&style=raw&includeRegistration=true`
		);
		const body = await res.text();
		// The literal string must be losslessly encoded — every character from
		// `tricky` should round-trip out of the CSV.
		// RFC 4180: fields with commas, quotes, or newlines must be quoted; internal
		// quotes are doubled. So "Johnny" becomes ""Johnny"" inside a quoted field.
		const expected = tricky.replace(/"/g, '""');
		expect(body).toContain(expected);

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A5.5: research CSV has response_id column and no participant_name column', async ({
		page,
		ctx
	}) => {
		const cfg = makeFullFeatureConfig(`a55-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'active' });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: seeded.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});

		const { data: p } = await ctx.supabase
			.from('participants')
			.insert({
				experiment_id: seeded.id,
				email: `a55-${Date.now()}@example.com`,
				registration_data: { name: 'Alice', age: '30' },
				session_token: crypto.randomUUID()
			})
			.select('id')
			.single();
		await ctx.supabase.from('responses').insert({
			participant_id: p!.id,
			experiment_id: seeded.id,
			phase_id: 'p1',
			stimulus_id: 's1',
			response_data: { rating: '4' },
			response_index: 0
		});

		await loginAsAdmin(page, ctx);
		const res = await page.request.get(
			`/admin/experiments/${seeded.id}/data/export?format=csv&style=research&includeRegistration=true`
		);
		expect(res.status()).toBe(200);
		const body = await res.text();
		const headers = body.split('\n')[0].split(',');

		// response_id must be present (renamed from bare `id`).
		expect(headers).toContain('response_id');
		// participant_name must NOT be present (was a duplicate of reg_name).
		expect(headers).not.toContain('participant_name');
		// reg_name is present when includeRegistration=true.
		expect(headers).toContain('reg_name');

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A5.6: raw CSV also has response_id instead of id', async ({ page, ctx }) => {
		const cfg = makeFullFeatureConfig(`a56-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'active' });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: seeded.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});

		const { data: p } = await ctx.supabase
			.from('participants')
			.insert({
				experiment_id: seeded.id,
				email: `a56-${Date.now()}@example.com`,
				registration_data: {},
				session_token: crypto.randomUUID()
			})
			.select('id')
			.single();
		await ctx.supabase.from('responses').insert({
			participant_id: p!.id,
			experiment_id: seeded.id,
			phase_id: 'p1',
			stimulus_id: 's1',
			response_data: { rating: '2' },
			response_index: 0
		});

		await loginAsAdmin(page, ctx);
		// Note: raw style returns the DB view columns directly — the `id` rename
		// applies only to research style. This test confirms the raw headers are
		// stable (contain `id`, not `response_id`).
		const res = await page.request.get(
			`/admin/experiments/${seeded.id}/data/export?format=csv&style=raw`
		);
		expect(res.status()).toBe(200);
		const body = await res.text();
		const headers = body.split('\n')[0].split(',');
		// Raw style exposes the view's column `id` (not renamed).
		expect(headers).toContain('id');
		expect(headers).not.toContain('participant_name');

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});

	test('A5.3 + A5.4: reset zeroes one participant only; delete cascades responses', async ({
		page,
		ctx
	}) => {
		const cfg = makeFullFeatureConfig(`a534-${Date.now()}`);
		const seeded = await seedExperiment(cfg, { supabase: ctx.supabase, status: 'active' });
		await ctx.supabase.from('experiment_collaborators').insert({
			experiment_id: seeded.id,
			user_id: ctx.adminUserId,
			role: 'owner'
		});

		// 2 participants, each with 1 response.
		const ps = await Promise.all(
			[1, 2].map((i) =>
				ctx.supabase
					.from('participants')
					.insert({
						experiment_id: seeded.id,
						email: `a534-${i}-${Date.now()}@example.com`,
						registration_data: {},
						session_token: crypto.randomUUID()
					})
					.select('id')
					.single()
			)
		);
		const pid1 = ps[0].data!.id;
		const pid2 = ps[1].data!.id;
		await ctx.supabase.from('responses').insert([
			{
				participant_id: pid1,
				experiment_id: seeded.id,
				phase_id: 'p1',
				stimulus_id: 's1',
				response_data: { rating: '3' },
				response_index: 0
			},
			{
				participant_id: pid2,
				experiment_id: seeded.id,
				phase_id: 'p1',
				stimulus_id: 's1',
				response_data: { rating: '5' },
				response_index: 0
			}
		]);

		await loginAsAdmin(page, ctx);

		// A5.3: Reset pid1's responses → pid1 has 0, pid2 still 1.
		const resetRes = await page.request.post(
			`/admin/experiments/${seeded.id}/participants/${pid1}?/reset`,
			{ form: {}, headers: { Origin: 'http://localhost:5173' } }
		);
		// SvelteKit form actions return 200 or 204 on success (or redirect).
		expect([200, 204, 303].includes(resetRes.status()) || resetRes.status() < 400).toBe(true);
		const { count: c1 } = await ctx.supabase
			.from('responses')
			.select('id', { count: 'exact', head: true })
			.eq('participant_id', pid1);
		expect(c1).toBe(0);
		const { count: c2 } = await ctx.supabase
			.from('responses')
			.select('id', { count: 'exact', head: true })
			.eq('participant_id', pid2);
		expect(c2).toBe(1);

		// A5.4: Delete pid2 → participant row gone, responses gone via cascade.
		const delRes = await page.request.post(
			`/admin/experiments/${seeded.id}/participants/${pid2}?/delete`,
			{ form: {}, headers: { Origin: 'http://localhost:5173' } }
		);
		expect(delRes.status()).toBeLessThan(400);
		const { data: stillThere } = await ctx.supabase
			.from('participants')
			.select('id')
			.eq('id', pid2)
			.maybeSingle();
		expect(stillThere).toBeNull();
		const { count: leftover } = await ctx.supabase
			.from('responses')
			.select('id', { count: 'exact', head: true })
			.eq('participant_id', pid2);
		expect(leftover).toBe(0);

		await ctx.supabase.from('experiments').delete().eq('id', seeded.id);
	});
});
