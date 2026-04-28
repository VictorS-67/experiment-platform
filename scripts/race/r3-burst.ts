// R3 — Optimistic-lock RPC under burst, chained baselines.
//
// Unlike R2 (which uses the SAME baseline for both writers → one wins, one
// aborts), R3 fires N calls in sequence where each writer uses the CURRENT
// updated_at as its expected baseline. Each save bumps the version. With FOR
// UPDATE row locking inside `upsert_config_with_version`, serial ordering
// must emerge — exactly N version rows, no lost updates, no duplicate
// version_number values.
//
// Usage: npx tsx scripts/race/r3-burst.ts

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
	const N = 10;
	const slug = `race-r3-${Date.now()}`;
	const baseCfg = {
		slug,
		version: 1,
		status: 'active',
		metadata: { title: { en: 'R3' }, languages: ['en'], defaultLanguage: 'en' },
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
		.insert({ slug, config: baseCfg, status: 'active' })
		.select('id, updated_at')
		.single();
	if (e1 || !exp) throw new Error(`seed: ${e1?.message}`);

	// Chain N saves, each using the previous save's returned updated_at.
	let expectedTs: string = exp.updated_at;
	let lastVersion = 1;
	for (let i = 0; i < N; i++) {
		const cfg = { ...baseCfg, version: lastVersion + 1 };
		const { data, error } = await supabase.rpc('upsert_config_with_version', {
			exp_id: exp.id,
			cfg,
			new_slug: null,
			expected_updated_at: expectedTs
		});
		if (error) {
			console.error(`R3 FAIL at i=${i}:`, error);
			await supabase.from('experiments').delete().eq('id', exp.id);
			process.exit(1);
		}
		const row = Array.isArray(data) ? data[0] : data;
		expectedTs = row.updated_at;
		lastVersion = cfg.version;
	}

	// DB: exactly N version rows, unique version_number, ascending.
	const { data: versions } = await supabase
		.from('experiment_config_versions')
		.select('version_number')
		.eq('experiment_id', exp.id)
		.order('version_number');

	await supabase.from('experiments').delete().eq('id', exp.id);

	const nums = (versions ?? []).map((v) => v.version_number);
	if (nums.length !== N) {
		console.error(`R3 FAIL — expected ${N} versions, got ${nums.length}`);
		process.exit(1);
	}
	const unique = new Set(nums);
	if (unique.size !== N) {
		console.error('R3 FAIL — duplicate version_numbers:', nums);
		process.exit(1);
	}
	// Should be strictly increasing.
	for (let i = 1; i < nums.length; i++) {
		if (nums[i] <= nums[i - 1]) {
			console.error('R3 FAIL — version_numbers not strictly increasing:', nums);
			process.exit(1);
		}
	}
	console.log(`R3 PASS — ${N} sequential saves, unique monotonic version_numbers: ${nums.join(',')}`);
}

main().catch((e) => {
	console.error('R3 ERROR:', e);
	process.exit(1);
});
