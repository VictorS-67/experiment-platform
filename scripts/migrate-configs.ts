// One-shot config migrator (CLI entry point).
//
// Reads every row in `experiments`, applies known schema-evolution rules from
// `migrate-configs-rules.ts`, re-validates against the current Zod schema, and
// writes the upgraded config back. Idempotent: safe to run repeatedly.
//
// The pure migration logic lives in `migrate-configs-rules.ts` — this file is
// just the CLI wrapper (env loading, supabase client, dry-run / write modes,
// human-readable output). Test the rules from there.
//
// Usage:
//   npx tsx scripts/migrate-configs.ts              # dry run, prints what would change
//   npx tsx scripts/migrate-configs.ts --write      # actually writes the changes
//
// Exit codes:
//   0 — every config is valid (after migrations) and any --write succeeded
//   1 — at least one config could not be auto-migrated; manual fix required
//   2 — environment / connection error

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { ExperimentConfigSchema } from '../src/lib/config/schema';
import { applyMigrations } from './migrate-configs-rules';

loadEnv();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(2);
}

const WRITE = process.argv.includes('--write');
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
	const { data: rows, error } = await supabase
		.from('experiments')
		.select('id, slug, config');
	if (error) {
		console.error('Failed to load experiments:', error.message);
		process.exit(2);
	}
	if (!rows) {
		console.log('No experiments found.');
		process.exit(0);
	}

	console.log(`Found ${rows.length} experiment(s). Mode: ${WRITE ? 'WRITE' : 'DRY RUN'}\n`);

	let anyFailed = false;
	let migratedCount = 0;
	let alreadyValidCount = 0;

	for (const row of rows) {
		const { config: migrated, changed, notes } = applyMigrations(row.config);
		const result = ExperimentConfigSchema.safeParse(migrated);

		if (!result.success) {
			anyFailed = true;
			console.log(`✗ ${row.slug} (${row.id}) — does NOT validate after migrations:`);
			for (const issue of result.error.issues.slice(0, 10)) {
				console.log(`    ${issue.path.join('.') || '(root)'}: ${issue.message}`);
			}
			if (result.error.issues.length > 10) {
				console.log(`    …and ${result.error.issues.length - 10} more`);
			}
			if (notes.length) {
				console.log('  Migration notes:');
				notes.forEach((n) => console.log(`    ${n}`));
			}
			console.log();
			continue;
		}

		if (!changed) {
			alreadyValidCount++;
			continue;
		}

		migratedCount++;
		console.log(`✓ ${row.slug} (${row.id}) — migrated:`);
		notes.forEach((n) => console.log(`  ${n}`));

		if (WRITE) {
			const { error: writeErr } = await supabase
				.from('experiments')
				.update({ config: result.data, updated_at: new Date().toISOString() })
				.eq('id', row.id);
			if (writeErr) {
				anyFailed = true;
				console.log(`  ✗ write failed: ${writeErr.message}`);
			} else {
				console.log('  → written');
			}
		}
		console.log();
	}

	console.log(
		`Summary: ${alreadyValidCount} already valid, ${migratedCount} migrated, ${anyFailed ? 'with failures' : 'no failures'}.`
	);
	if (!WRITE && migratedCount > 0) {
		console.log('Re-run with --write to persist these changes.');
	}
	process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
	console.error('Unexpected error:', err);
	process.exit(2);
});
