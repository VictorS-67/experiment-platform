// Seed script: inserts experiment configs into Supabase
// Usage: node scripts/seed.js [config-file]
// Examples:
//   node scripts/seed.js                                    # seeds movement-onomatopoeia (default)
//   node scripts/seed.js configs/movement-description.json  # seeds movement-description
//   node scripts/seed.js --all                              # seeds all configs in configs/

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
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

async function seedConfig(configPath) {
	const configJson = JSON.parse(readFileSync(configPath, 'utf-8'));
	const { slug, status } = configJson;

	console.log(`Inserting experiment: ${slug}`);

	const { data, error } = await supabase
		.from('experiments')
		.upsert(
			{ slug, status: status || 'active', config: configJson },
			{ onConflict: 'slug' }
		)
		.select()
		.single();

	if (error) {
		console.error(`Failed to insert ${slug}:`, error.message);
		return false;
	}

	console.log(`  ID: ${data.id}`);
	console.log(`  Slug: ${data.slug}`);
	console.log(`  Status: ${data.status}`);
	console.log(`  URL: /e/${data.slug}/`);
	return true;
}

async function main() {
	const arg = process.argv[2];

	if (arg === '--all') {
		const configsDir = resolve(__dirname, '../configs');
		const files = readdirSync(configsDir).filter(f => f.endsWith('.json'));
		console.log(`Seeding ${files.length} configs...\n`);
		for (const file of files) {
			await seedConfig(resolve(configsDir, file));
			console.log('');
		}
	} else {
		const configPath = arg
			? resolve(arg)
			: resolve(__dirname, '../configs/movement-onomatopoeia.json');
		await seedConfig(configPath);
	}

	console.log('Done!');
}

main();
