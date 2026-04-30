// Detect and migrate the legacy select + conditional-text two-field pattern to
// the new `select-or-other` field type.
//
// The migration is surgical (per-experiment, opt-in) because some experiments
// may legitimately want to keep the two-field shape (e.g. when knowing that the
// participant picked "Other" as a distinct fact matters for the analysis).
//
// Usage:
//   npx tsx scripts/migrate-select-or-other.ts
//       Dry run — prints every detected pair across all experiments. No writes.
//
//   npx tsx scripts/migrate-select-or-other.ts \
//       --migrate "exp-slug:parent_field_id,exp-slug2:parent_field_id2" \
//       --i-have-a-backup
//       Write mode — migrates only the listed pairs. Requires --i-have-a-backup.
//
// Exit codes:
//   0 — success (dry run completed, or write succeeded with no errors)
//   1 — at least one pair failed to migrate
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
const migrateArg = args.find((a) => a.startsWith('--migrate='))?.slice('--migrate='.length)
	?? (args.includes('--migrate') ? args[args.indexOf('--migrate') + 1] : null);
const hasBackup = args.includes('--i-have-a-backup');
const WRITE = migrateArg !== null;

if (WRITE && !hasBackup) {
	console.error('--migrate requires --i-have-a-backup (take a Supabase backup before proceeding).');
	process.exit(2);
}

// Parse allowlist: "slug:parentFieldId,slug2:parentFieldId2"
type AllowlistEntry = { slug: string; parentFieldId: string };
const allowlist: AllowlistEntry[] = WRITE
	? migrateArg!.split(',').map((item) => {
			const [slug, parentFieldId] = item.trim().split(':');
			if (!slug || !parentFieldId) {
				console.error(`Invalid --migrate entry "${item}". Expected format: slug:parent_field_id`);
				process.exit(2);
			}
			return { slug, parentFieldId };
		})
	: [];

const supabase = createClient(supabaseUrl, serviceRoleKey);

type Field = {
	id: string;
	type: string;
	options?: Array<{ value: string; label: Record<string, string> }>;
	conditionalOn?: { field: string; value: string };
	[key: string]: unknown;
};

type DetectedPair = {
	experimentId: string;
	slug: string;
	parentFieldId: string;
	childFieldId: string;
	otherOptionValue: string;
};

function detectPairs(slug: string, expId: string, config: Record<string, unknown>): DetectedPair[] {
	const registration = config.registration as { fields?: Field[] } | undefined;
	const fields = registration?.fields ?? [];
	const results: DetectedPair[] = [];

	const fieldById = new Map<string, Field>(fields.map((f) => [f.id, f]));

	for (const child of fields) {
		if (child.type !== 'text' || !child.conditionalOn) continue;
		const parentId = child.conditionalOn.field;
		const triggerValue = child.conditionalOn.value;
		const parent = fieldById.get(parentId);
		if (!parent) continue;
		if (parent.type !== 'select' && parent.type !== 'multiselect') continue;
		// Verify the trigger value is one of the parent's option values
		// (or accept it even if not explicitly listed — some configs might have it as an implicit choice).
		results.push({
			experimentId: expId,
			slug,
			parentFieldId: parentId,
			childFieldId: child.id,
			otherOptionValue: triggerValue
		});
	}

	return results;
}

async function main() {
	const { data: rows, error } = await supabase
		.from('experiments')
		.select('id, slug, config');
	if (error) {
		console.error('Failed to load experiments:', error.message);
		process.exit(2);
	}

	const allPairs: DetectedPair[] = [];
	for (const row of rows ?? []) {
		const pairs = detectPairs(row.slug, row.id, row.config as Record<string, unknown>);
		allPairs.push(...pairs);
	}

	console.log(`Mode: ${WRITE ? 'WRITE' : 'DRY RUN'}`);
	console.log();

	if (allPairs.length === 0) {
		console.log('No select + conditional-text pairs detected. Nothing to migrate.');
		process.exit(0);
	}

	console.log('Detected pairs:');
	for (const pair of allPairs) {
		const onAllowlist = WRITE && allowlist.some(
			(e) => e.slug === pair.slug && e.parentFieldId === pair.parentFieldId
		);
		const marker = WRITE ? (onAllowlist ? '→ WILL MIGRATE' : '  (skipped — not on allowlist)') : '';
		console.log(
			`  ${pair.slug} : ${pair.parentFieldId} + ${pair.childFieldId}` +
			`  (Other-option value: "${pair.otherOptionValue}")` +
			(marker ? `  [${marker}]` : '')
		);
	}
	console.log();

	if (!WRITE) {
		console.log(
			'Re-run with --migrate "slug:parentFieldId,..." --i-have-a-backup to migrate specific pairs.'
		);
		process.exit(0);
	}

	// Verify every allowlist entry was found.
	for (const entry of allowlist) {
		const found = allPairs.some(
			(p) => p.slug === entry.slug && p.parentFieldId === entry.parentFieldId
		);
		if (!found) {
			console.error(
				`Allowlist entry "${entry.slug}:${entry.parentFieldId}" was not detected as a valid pair.` +
				' Check the slug and parent field id.'
			);
			process.exit(1);
		}
	}

	const toMigrate = allPairs.filter((p) =>
		allowlist.some((e) => e.slug === p.slug && e.parentFieldId === p.parentFieldId)
	);

	let anyFailed = false;
	for (const pair of toMigrate) {
		console.log(`Migrating ${pair.slug} : ${pair.parentFieldId} ...`);
		const { data, error: rpcErr } = await supabase.rpc(
			'migrate_select_or_other_for_experiment',
			{
				exp_id: pair.experimentId,
				parent_field_id: pair.parentFieldId,
				child_field_id: pair.childFieldId,
				operator_email: process.env.OPERATOR_EMAIL ?? null
			}
		);
		if (rpcErr) {
			anyFailed = true;
			console.log(`  ✗ failed: ${rpcErr.message}`);
		} else {
			const result = data as { participants_updated: number; config_version: number };
			console.log(
				`  ✓ done — ${result.participants_updated} participant(s) rewritten,` +
				` config version ${result.config_version}`
			);
		}
	}

	process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
	console.error('Unexpected error:', err);
	process.exit(2);
});
