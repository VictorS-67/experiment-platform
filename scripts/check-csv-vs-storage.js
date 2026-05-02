#!/usr/bin/env node
// Compare filenames in stimuli_combined.csv vs files actually present in storage.
// Usage: node scripts/check-csv-vs-storage.js [storage-prefix]
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const url = env.match(/^PUBLIC_SUPABASE_URL=(.+)$/m)?.[1].trim();
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1].trim();
if (!url || !key) throw new Error('missing env vars');

const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'experiments';
const prefix = process.argv[2] ?? 'stimuli/diema/';

async function listAll(p) {
	const out = [];
	let offset = 0;
	while (true) {
		const { data, error } = await supabase.storage.from(BUCKET).list(p, { limit: 1000, offset });
		if (error) throw error;
		if (!data || data.length === 0) break;
		for (const entry of data) {
			if (entry.id === null || entry.metadata === null) {
				out.push(...(await listAll(`${p}${entry.name}/`)));
			} else {
				out.push(entry.name);
			}
		}
		if (data.length < 1000) break;
		offset += 1000;
	}
	return out;
}

const storage = new Set(await listAll(prefix));
console.log(`storage prefix=${prefix}: ${storage.size} files`);

const csv = readFileSync('stimuli_combined.csv', 'utf8').split('\n').slice(1).filter(Boolean);
const csvFilenames = csv.map((line) => line.split(',')[1]);
console.log(`csv: ${csvFilenames.length} rows`);

const missing = csvFilenames.filter((f) => !storage.has(f));
const extra = [...storage].filter((f) => !csvFilenames.includes(f));

console.log(`\nin CSV but NOT in storage: ${missing.length}`);
for (const f of missing.slice(0, 10)) console.log('  -', f);
if (missing.length > 10) console.log(`  …(${missing.length - 10} more)`);

console.log(`\nin storage but NOT in CSV: ${extra.length}`);
for (const f of extra.slice(0, 10)) console.log('  -', f);
if (extra.length > 10) console.log(`  …(${extra.length - 10} more)`);

// Persist for next-step usage
writeFileSync('storage_files.txt', [...storage].sort().join('\n') + '\n');
writeFileSync('missing_from_storage.txt', missing.sort().join('\n') + '\n');
console.log(`\nwrote storage_files.txt and missing_from_storage.txt`);
