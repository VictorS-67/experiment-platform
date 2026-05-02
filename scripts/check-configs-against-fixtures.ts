// CI-safe schema check: applies migration rules + Zod validation to every
// experiment config fixture under tests/e2e/fixtures/. No Supabase credentials
// needed. Fails CI if any fixture can't be auto-migrated to the current schema.
//
// Catches regressions against KNOWN config shapes that the E2E suite exercises.
// To verify against actual prod data (which may have shapes the fixtures don't
// represent), use `npm run check-configs` locally with prod creds — see
// CLAUDE.md "Schema migration runbook".
//
// Exit codes:
//   0 — every fixture validates (after migration rules applied)
//   1 — at least one fixture fails; manual triage required (see runbook)
//   2 — environment / file-read error

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExperimentConfigSchema } from '../src/lib/config/schema';
import { applyMigrations } from './migrate-configs-rules';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'tests', 'e2e', 'fixtures');

type FixtureFile = { path: string; content: unknown };

function loadFixtures(): FixtureFile[] {
	let files: string[];
	try {
		files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
	} catch (err) {
		console.error(`Could not read fixtures dir ${FIXTURES_DIR}:`, err);
		process.exit(2);
	}
	return files.map((f) => {
		const path = join(FIXTURES_DIR, f);
		try {
			const content = JSON.parse(readFileSync(path, 'utf8'));
			return { path: f, content };
		} catch (err) {
			console.error(`Could not parse ${f}:`, err);
			process.exit(2);
		}
	});
}

const fixtures = loadFixtures();
if (fixtures.length === 0) {
	console.error(`No fixtures found in ${FIXTURES_DIR}`);
	process.exit(2);
}

let failures = 0;
for (const { path, content } of fixtures) {
	const { config: migrated } = applyMigrations(content);
	const result = ExperimentConfigSchema.safeParse(migrated);
	if (result.success) {
		console.log(`  ✓ ${path}`);
	} else {
		failures++;
		console.error(`  ✗ ${path}`);
		for (const issue of result.error.issues) {
			console.error(`     ${issue.path.join('.')}: ${issue.message}`);
		}
	}
}

console.log('');
if (failures > 0) {
	console.error(
		`${failures} fixture(s) failed schema validation. ` +
			`See CLAUDE.md "Schema migration runbook" for triage steps.`
	);
	process.exit(1);
}
console.log(`All ${fixtures.length} fixtures validated cleanly against the current schema.`);
process.exit(0);
