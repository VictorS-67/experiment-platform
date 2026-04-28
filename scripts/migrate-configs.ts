// One-shot config migrator.
//
// Reads every row in `experiments`, applies known compatibility fixes
// (currently: `jn` → `ja` typo for localized strings), re-validates against
// the current Zod schema, and writes the upgraded config back. Idempotent:
// safe to run repeatedly.
//
// Usage:
//   npx tsx scripts/migrate-configs.ts              # dry run, prints what would change
//   npx tsx scripts/migrate-configs.ts --write      # actually writes the changes
//
// Exit codes:
//   0 — every config is valid (after migrations) and any --write succeeded
//   1 — at least one config could not be auto-migrated; manual fix required
//   2 — environment / connection error
//
// Add new schema-evolution rules to MIGRATIONS below as the schema tightens.

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { ExperimentConfigSchema } from '../src/lib/config/schema';

loadEnv();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(2);
}

const WRITE = process.argv.includes('--write');
const supabase = createClient(supabaseUrl, serviceRoleKey);

interface MigrationResult {
	config: unknown;
	changed: boolean;
	notes: string[];
}

interface Migration {
	name: string;
	apply: (config: unknown) => MigrationResult;
}

const MIGRATIONS: Migration[] = [
	// Normalize metadata.languages: `jn` (typo) → `ja`, dedupe.
	// Runs FIRST so the downstream walk doesn't have to care about the array.
	{
		name: 'normalize-metadata-languages',
		apply(config) {
			const notes: string[] = [];
			if (!config || typeof config !== 'object') return { config, changed: false, notes };
			const cfg = config as Record<string, unknown>;
			const metadata = cfg.metadata as Record<string, unknown> | undefined;
			if (!metadata || !Array.isArray(metadata.languages)) {
				return { config, changed: false, notes };
			}

			const originalLangs = metadata.languages as unknown[];
			const remapped = originalLangs.map((l) => (l === 'jn' ? 'ja' : l));
			const deduped = [...new Set(remapped)];
			const originalDefault = metadata.defaultLanguage;
			const remappedDefault = originalDefault === 'jn' ? 'ja' : originalDefault;

			const languagesChanged =
				deduped.length !== originalLangs.length ||
				deduped.some((l, i) => l !== originalLangs[i]);
			const defaultChanged = originalDefault !== remappedDefault;

			if (!languagesChanged && !defaultChanged) {
				return { config, changed: false, notes };
			}

			if (languagesChanged) notes.push(`$.metadata.languages: ${JSON.stringify(originalLangs)} → ${JSON.stringify(deduped)}`);
			if (defaultChanged) notes.push(`$.metadata.defaultLanguage: ${String(originalDefault)} → ${String(remappedDefault)}`);

			const newMetadata = { ...metadata, languages: deduped, defaultLanguage: remappedDefault };
			return {
				config: { ...cfg, metadata: newMetadata },
				changed: true,
				notes
			};
		}
	},
	// Fill missing min/max for likert (default 1..7) and slider (default 0..100, step 1).
	// The new schema refinement rejects these without bounds; assigning
	// conservative defaults lets old configs pass validation without hand-editing.
	{
		name: 'fill-likert-slider-range-defaults',
		apply(config) {
			const notes: string[] = [];
			let changed = false;

			function walkWidgets(
				widgets: unknown[],
				path: string
			): unknown[] {
				return widgets.map((w, i) => {
					if (!w || typeof w !== 'object') return w;
					const widget = w as Record<string, unknown>;
					const type = widget.type;
					if (type !== 'likert' && type !== 'slider') return widget;

					const cfg = (widget.config ?? {}) as Record<string, unknown>;
					const needsMin = typeof cfg.min !== 'number';
					const needsMax = typeof cfg.max !== 'number';
					if (!needsMin && !needsMax) return widget;

					const defaults =
						type === 'likert'
							? { min: 1, max: 7 }
							: { min: 0, max: 100, step: 1 };
					const newCfg = { ...cfg };
					if (needsMin) { newCfg.min = defaults.min; notes.push(`${path}[${i}].config.min set to ${defaults.min} (${type} default)`); }
					if (needsMax) { newCfg.max = defaults.max; notes.push(`${path}[${i}].config.max set to ${defaults.max} (${type} default)`); }
					if (type === 'slider' && typeof cfg.step !== 'number') {
						newCfg.step = 1;
						notes.push(`${path}[${i}].config.step set to 1 (slider default)`);
					}
					changed = true;
					return { ...widget, config: newCfg };
				});
			}

			if (!config || typeof config !== 'object') return { config, changed: false, notes };
			const cfg = config as Record<string, unknown>;

			const phases = Array.isArray(cfg.phases) ? cfg.phases : [];
			const newPhases = phases.map((p, pi) => {
				if (!p || typeof p !== 'object') return p;
				const phase = p as Record<string, unknown>;
				let nextPhase = phase;
				if (Array.isArray(phase.responseWidgets)) {
					const w = walkWidgets(phase.responseWidgets, `$.phases[${pi}].responseWidgets`);
					nextPhase = { ...nextPhase, responseWidgets: w };
				}
				if (phase.reviewConfig && typeof phase.reviewConfig === 'object') {
					const rc = phase.reviewConfig as Record<string, unknown>;
					if (Array.isArray(rc.responseWidgets)) {
						const w = walkWidgets(rc.responseWidgets, `$.phases[${pi}].reviewConfig.responseWidgets`);
						nextPhase = { ...nextPhase, reviewConfig: { ...rc, responseWidgets: w } };
					}
				}
				return nextPhase;
			});

			const completion = cfg.completion as Record<string, unknown> | undefined;
			let newCompletion = completion;
			if (completion && Array.isArray(completion.feedbackWidgets)) {
				const w = walkWidgets(completion.feedbackWidgets, `$.completion.feedbackWidgets`);
				newCompletion = { ...completion, feedbackWidgets: w };
			}

			if (!changed) return { config, changed: false, notes };
			return {
				config: { ...cfg, phases: newPhases, ...(newCompletion ? { completion: newCompletion } : {}) },
				changed: true,
				notes
			};
		}
	},
	{
		name: 'rename-language-code-jn-to-ja',
		apply(config) {
			const notes: string[] = [];
			let changed = false;
			const visited = new WeakSet<object>();

			function walk(value: unknown, path: string): unknown {
				if (value === null || typeof value !== 'object') return value;
				if (visited.has(value as object)) return value;
				visited.add(value as object);

				if (Array.isArray(value)) {
					return value.map((v, i) => walk(v, `${path}[${i}]`));
				}

				const obj = value as Record<string, unknown>;
				const out: Record<string, unknown> = {};
				for (const [key, child] of Object.entries(obj)) {
					if (key === 'jn') {
						const existingJa = obj.ja;
						if (existingJa && existingJa !== '') {
							notes.push(`${path}.jn dropped (already had ja=${JSON.stringify(existingJa)})`);
						} else if (typeof child === 'string' && child !== '') {
							out.ja = child;
							notes.push(`${path}.jn → ${path}.ja`);
						} else {
							notes.push(`${path}.jn dropped (empty)`);
						}
						changed = true;
					} else {
						out[key] = walk(child, `${path}.${key}`);
					}
				}
				return out;
			}

			return { config: walk(config, '$'), changed, notes };
		}
	}
];

function applyMigrations(config: unknown): MigrationResult {
	let current: unknown = config;
	const allNotes: string[] = [];
	let anyChanged = false;
	for (const m of MIGRATIONS) {
		const { config: next, changed, notes } = m.apply(current);
		if (changed) {
			anyChanged = true;
			allNotes.push(`[${m.name}]`, ...notes.map((n) => `  ${n}`));
		}
		current = next;
	}
	return { config: current, changed: anyChanged, notes: allNotes };
}

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
