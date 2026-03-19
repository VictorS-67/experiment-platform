// Seed script: inserts example experiment configs into Supabase
// Usage: node scripts/seed.js

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config(); // load .env

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seed() {
	// Read the config file
	const configJson = JSON.parse(
		readFileSync(new URL('../configs/movement-onomatopoeia.json', import.meta.url), 'utf-8')
	);

	// Extract slug and status from config, store the rest in the config column
	const { slug, status, ...restConfig } = configJson;

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
		console.error('Failed to insert:', error.message);
		process.exit(1);
	}

	console.log('Inserted experiment:');
	console.log(`  ID: ${data.id}`);
	console.log(`  Slug: ${data.slug}`);
	console.log(`  Status: ${data.status}`);
	console.log(`  URL: /e/${data.slug}/`);
	console.log('\nDone!');
}

seed();
