// R2 — Concurrent config save with the SAME expected_updated_at.
//
// Two parallel calls to upsert_config_with_version both claim the same
// experiment.updated_at as the baseline. Migration 014 takes `FOR UPDATE` on
// the experiment row first, so one caller must win and the other must abort
// with P0004 (ConfigConflictError). No torn state; no duplicate version rows
// for the losing caller.
//
// Usage: npx tsx scripts/race/r2-config-save.ts

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
	const slug = `race-r2-${Date.now()}`;
	const cfg = {
		slug,
		version: 1,
		status: 'active',
		metadata: { title: { en: 'R2' }, languages: ['en'], defaultLanguage: 'en' },
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
		.insert({ slug, config: cfg, status: 'active' })
		.select('id, updated_at')
		.single();
	if (e1 || !exp) throw new Error(`seed: ${e1?.message}`);

	const baseline = exp.updated_at;

	// Two parallel saves, both claiming `baseline` as the expected timestamp.
	const cfgA = { ...cfg, version: 2 };
	const cfgB = { ...cfg, version: 3 };
	const [rA, rB] = await Promise.all([
		supabase.rpc('upsert_config_with_version', {
			exp_id: exp.id,
			cfg: cfgA,
			new_slug: null,
			expected_updated_at: baseline
		}),
		supabase.rpc('upsert_config_with_version', {
			exp_id: exp.id,
			cfg: cfgB,
			new_slug: null,
			expected_updated_at: baseline
		})
	]);

	const outcomes = [rA, rB].map((r) => ({
		ok: !r.error,
		code: r.error ? (r.error as { code?: string }).code : null
	}));
	const okCount = outcomes.filter((o) => o.ok).length;
	const p0004Count = outcomes.filter((o) => o.code === 'P0004').length;

	// Verify DB: exactly one version row was added.
	const { data: versions } = await supabase
		.from('experiment_config_versions')
		.select('id, version_number, config')
		.eq('experiment_id', exp.id);

	// Cleanup.
	await supabase.from('experiments').delete().eq('id', exp.id);

	if (okCount !== 1 || p0004Count !== 1) {
		console.error('R2 FAIL — expected exactly 1 success + 1 P0004, got', outcomes);
		process.exit(1);
	}
	if ((versions ?? []).length !== 1) {
		console.error('R2 FAIL — expected exactly 1 version row, got', (versions ?? []).length);
		process.exit(1);
	}
	console.log('R2 PASS — one writer won, the other got P0004, exactly one version row inserted.');
}

main().catch((e) => {
	console.error('R2 ERROR:', e);
	process.exit(1);
});
