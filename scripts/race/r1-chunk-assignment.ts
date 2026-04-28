// R1 — Concurrent chunk assignment.
//
// Fires N parallel calls to set_chunk_assignment for the same participant +
// chunk key. Migration 009's RPC uses `jsonb_set` inside a single UPDATE, so
// the last writer wins atomically — but there must be NO lost keys when many
// different chunk keys are written concurrently, and no torn reads.
//
// This script creates a fresh disposable experiment + participant, then fires
// 10 concurrent assignments, each for a DIFFERENT chunk key. At the end the
// participant's chunk_assignments JSONB should have all 10 keys present with
// the value each writer intended — no drops, no partial updates.
//
// Usage: npx tsx scripts/race/r1-chunk-assignment.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
	console.error('Missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
	process.exit(2);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl)) {
	console.error('Refusing to run against non-local Supabase:', supabaseUrl);
	process.exit(2);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
	const slug = `race-r1-${Date.now()}`;
	const minimalConfig = {
		slug,
		version: 1,
		status: 'active',
		metadata: { title: { en: 'R1' }, languages: ['en'], defaultLanguage: 'en' },
		registration: { introduction: { title: { en: 'X' }, body: { en: 'Y' } }, fields: [] },
		tutorial: null,
		phases: [
			{
				id: 'p1',
				slug: 'p1',
				type: 'stimulus-response',
				title: { en: 'P1' },
				responseWidgets: [],
				stimulusOrder: 'sequential',
				allowRevisit: true,
				allowMultipleResponses: false,
				completion: { title: { en: 'd' }, body: { en: 'b' } }
			}
		],
		stimuli: { type: 'text', source: 'external-urls', items: [{ id: 's1', type: 'text', label: { en: 'x' } }] },
		completion: { title: { en: 't' }, body: { en: 'b' }, feedbackWidgets: [] }
	};
	const { data: exp, error: e1 } = await supabase
		.from('experiments')
		.insert({ slug, config: minimalConfig, status: 'active' })
		.select('id')
		.single();
	if (e1 || !exp) throw new Error(`seed experiment: ${e1?.message}`);

	const { data: p, error: e2 } = await supabase
		.from('participants')
		.insert({
			experiment_id: exp.id,
			email: `r1-${Date.now()}@example.com`,
			registration_data: {},
			session_token: crypto.randomUUID()
		})
		.select('id')
		.single();
	if (e2 || !p) throw new Error(`seed participant: ${e2?.message}`);

	// 10 concurrent calls, each writing a distinct chunk key.
	const N = 10;
	const keys = Array.from({ length: N }, (_, i) => `chunk-${i}`);
	const results = await Promise.all(
		keys.map((k, i) =>
			supabase.rpc('set_chunk_assignment', {
				p_id: p.id,
				chunk_key: k,
				assignment: { blockOrder: [`b-${i}`], assignedAt: new Date().toISOString() }
			})
		)
	);
	const errs = results.filter((r) => r.error);
	if (errs.length) {
		console.error(`${errs.length}/${N} RPCs errored:`, errs.map((r) => r.error?.message));
	}

	// Read back. Every one of the 10 keys must be present with the value its writer intended.
	const { data: reread } = await supabase
		.from('participants')
		.select('chunk_assignments')
		.eq('id', p.id)
		.single();
	const ca = (reread!.chunk_assignments as Record<string, { blockOrder: string[] }>) ?? {};
	const missing: string[] = [];
	const wrong: string[] = [];
	for (let i = 0; i < N; i++) {
		const key = keys[i];
		if (!ca[key]) { missing.push(key); continue; }
		if (ca[key].blockOrder[0] !== `b-${i}`) wrong.push(key);
	}

	// Cleanup.
	await supabase.from('experiments').delete().eq('id', exp.id);

	if (errs.length || missing.length || wrong.length) {
		console.error('R1 FAIL', { rpcErrors: errs.length, missing, wrong });
		process.exit(1);
	}
	console.log(`R1 PASS — ${N} concurrent chunk assignments all landed, no drops, no wrong values.`);
}

main().catch((e) => {
	console.error('R1 ERROR:', e);
	process.exit(1);
});
