// Export script: pulls experiment configs from Supabase into configs/
// Usage: node scripts/export-configs.js
// Writes one JSON file per experiment to configs/<slug>.json
// Existing files are overwritten.

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

config(); // load .env

const __dirname = dirname(fileURLToPath(import.meta.url));
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
	const { data: experiments, error } = await supabase
		.from('experiments')
		.select('slug, status, config')
		.order('slug');

	if (error) {
		console.error('Failed to fetch experiments:', error.message);
		process.exit(1);
	}

	if (!experiments || experiments.length === 0) {
		console.log('No experiments found.');
		return;
	}

	const configsDir = resolve(__dirname, '../configs');
	mkdirSync(configsDir, { recursive: true });

	console.log(`Exporting ${experiments.length} experiment(s)...\n`);

	for (const exp of experiments) {
		const filePath = resolve(configsDir, `${exp.slug}.json`);
		writeFileSync(filePath, JSON.stringify(exp.config, null, 2) + '\n', 'utf-8');
		console.log(`  [${exp.status}] ${exp.slug} → configs/${exp.slug}.json`);
	}

	console.log('\nDone!');
}

main();
