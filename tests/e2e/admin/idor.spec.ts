import { test, expect, loginAsAdmin } from '../fixtures';
import { seedExperiment, makeFullFeatureConfig } from '../seed';

/**
 * A5.8 — IDOR: admin A tries to visit /admin/experiments/<EXP-A>/participants/<PID-FROM-EXP-B>
 * by pasting a participant UUID that belongs to a different experiment.
 *
 * Expected (per playbook): 404 (not 403 — we hide existence).
 */

test.describe('A5.8 participant IDOR', () => {
	test('admin on experiment A cannot access a participant belonging to experiment B', async ({
		page,
		ctx
	}) => {
		// Seed two experiments owned by the test admin.
		const cfgA = makeFullFeatureConfig(`idor-a-${Date.now()}`);
		const cfgB = makeFullFeatureConfig(`idor-b-${Date.now()}`);
		const expA = await seedExperiment(cfgA, { supabase: ctx.supabase, status: 'active' });
		const expB = await seedExperiment(cfgB, { supabase: ctx.supabase, status: 'active' });

		for (const id of [expA.id, expB.id]) {
			await ctx.supabase.from('experiment_collaborators').insert({
				experiment_id: id,
				user_id: ctx.adminUserId,
				role: 'owner'
			});
		}

		// Create a participant row in experiment B directly (no need to run through
		// the UI — we only need a row to attempt the IDOR against).
		const { data: participantB, error: pErr } = await ctx.supabase
			.from('participants')
			.insert({
				experiment_id: expB.id,
				email: `idor-victim-${Date.now()}@example.com`,
				registration_data: { secret: 'this should never leak' },
				session_token: crypto.randomUUID()
			})
			.select('id')
			.single();
		expect(pErr).toBeNull();
		expect(participantB?.id).toBeTruthy();

		await loginAsAdmin(page, ctx);

		// Visit A's participants URL with B's participant id.
		const res = await page.goto(
			`/admin/experiments/${expA.id}/participants/${participantB!.id}`
		);
		expect(res).not.toBeNull();
		const status = res!.status();

		// Playbook: 404 (not 403 — we hide existence).
		expect(status).toBe(404);

		// The page body must never show the secret registration data.
		const body = await page.content();
		expect(body).not.toContain('this should never leak');

		// Cleanup
		await ctx.supabase.from('experiments').delete().in('id', [expA.id, expB.id]);
	});
});
