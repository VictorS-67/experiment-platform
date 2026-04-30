// Normalize legacy string-sentinel skip rows in responses.response_data.
//
// Before the gatekeeper fix, "No" wrote a configurable string sentinel (default
// "null") into every widget — e.g. {w1: "null", w2: "null"}.  After the fix,
// skip rows use JSON null per key — {w1: null, w2: null}.  This script
// normalizes old rows so the dataset is uniform.
//
// Detection is sentinel-agnostic: a row is a skip candidate when:
//   1. response_data has >= 2 keys (single-widget phases excluded).
//   2. Every value is a non-null JSON primitive (string or number).
//   3. All values are equal to each other.
//
// IMPORTANT: always inspect the dry-run output before writing.  The heuristic
// has a theoretical false-positive risk (participants who typed identical answers
// in every widget).  Use --exclude to skip experiments where the dry-run shows
// suspicious matches.
//
// Usage:
//   npx tsx scripts/migrate-skip-rows.ts
//       Dry run. Prints per-experiment counts + up to 5 sample rows. No writes.
//
//   npx tsx scripts/migrate-skip-rows.ts --write --i-have-a-backup
//       Write mode. Rewrites detected rows via the normalize_skip_rows_for_experiment
//       RPC (single transaction per experiment).
//
//   npx tsx scripts/migrate-skip-rows.ts --exclude "slug1,slug2" --write --i-have-a-backup
//       Exclude specific experiments from the write pass.
//
// Exit codes:
//   0 — success
//   1 — at least one experiment failed
//   2 — environment / argument error

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(2);
}

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const hasBackup = args.includes('--i-have-a-backup');

if (WRITE && !hasBackup) {
	console.error('--write requires --i-have-a-backup (take a Supabase backup before proceeding).');
	process.exit(2);
}

const excludeArg = args.find((a) => a.startsWith('--exclude='))?.slice('--exclude='.length)
	?? (args.includes('--exclude') ? args[args.indexOf('--exclude') + 1] : null);
const excluded = new Set(excludeArg ? excludeArg.split(',').map((s) => s.trim()) : []);

const supabase = createClient(supabaseUrl, serviceRoleKey);

type ResponseRow = {
	id: string;
	participant_id: string;
	stimulus_id: string;
	response_data: Record<string, unknown>;
};

function isSkipCandidate(responseData: Record<string, unknown>): boolean {
	const values = Object.values(responseData);
	if (values.length < 2) return false;
	const allPrimitiveNonNull = values.every(
		(v) => v !== null && (typeof v === 'string' || typeof v === 'number')
	);
	if (!allPrimitiveNonNull) return false;
	const first = values[0];
	return values.every((v) => v === first);
}

async function main() {
	const { data: experiments, error: expErr } = await supabase
		.from('experiments')
		.select('id, slug');
	if (expErr) {
		console.error('Failed to load experiments:', expErr.message);
		process.exit(2);
	}

	console.log(`Mode: ${WRITE ? 'WRITE' : 'DRY RUN'}`);
	if (excluded.size > 0) console.log(`Excluding: ${[...excluded].join(', ')}`);
	console.log();

	let anyFailed = false;
	let totalDetected = 0;

	for (const exp of experiments ?? []) {
		if (excluded.has(exp.slug)) {
			console.log(`${exp.slug} — skipped (excluded)`);
			continue;
		}

		// Fetch all response rows for this experiment (dry-run needs to inspect values).
		const { data: responses, error: respErr } = await supabase
			.from('responses')
			.select('id, participant_id, stimulus_id, response_data')
			.eq('experiment_id', exp.id);

		if (respErr) {
			anyFailed = true;
			console.log(`${exp.slug} — ✗ failed to fetch responses: ${respErr.message}`);
			continue;
		}

		const candidates = (responses ?? []).filter((r: ResponseRow) =>
			isSkipCandidate(r.response_data)
		);

		if (candidates.length === 0) {
			continue;
		}

		totalDetected += candidates.length;
		console.log(`${exp.slug} — ${candidates.length} skip row(s) detected:`);
		const samples = candidates.slice(0, 5);
		for (const row of samples) {
			const sentinel = Object.values(row.response_data)[0];
			console.log(
				`  response ${row.id}  participant ${row.participant_id}` +
				`  stimulus ${row.stimulus_id}  sentinel="${sentinel}"`
			);
		}
		if (candidates.length > 5) {
			console.log(`  …and ${candidates.length - 5} more`);
		}

		if (WRITE) {
			const { data: rpcResult, error: rpcErr } = await supabase.rpc(
				'normalize_skip_rows_for_experiment',
				{ exp_id: exp.id }
			);
			if (rpcErr) {
				anyFailed = true;
				console.log(`  ✗ write failed: ${rpcErr.message}`);
			} else {
				const result = rpcResult as { rows_rewritten: number };
				console.log(`  ✓ ${result.rows_rewritten} row(s) rewritten`);
			}
		}
		console.log();
	}

	if (totalDetected === 0) {
		console.log('No skip-row candidates found. Nothing to normalize.');
	} else if (!WRITE) {
		console.log(`Total: ${totalDetected} row(s) across all experiments.`);
		console.log('Inspect the samples above for false positives, then re-run with --write --i-have-a-backup.');
		if (excluded.size === 0) {
			console.log('Use --exclude "slug1,slug2" to skip experiments with ambiguous matches.');
		}
	}

	process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
	console.error('Unexpected error:', err);
	process.exit(2);
});
