// Upload all 144 videos from movement-to-onomatopoeia to Supabase Storage
// Usage: node scripts/upload-all-videos.js
//
// Uploads to: experiments/stimuli/movement-onomatopoeia/
// Shows progress. Safe to re-run (upsert: true).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const BUCKET = 'experiments';
const STORAGE_FOLDER = 'stimuli/movement-onomatopoeia';
const SOURCE_DIR = '../movement-to-onomatopoeia/videos';
const TOTAL = 144;

let uploaded = 0;
let skipped = 0;
let failed = 0;

async function uploadVideo(id) {
	const filename = `${id}.mp4`;
	const localPath = `${SOURCE_DIR}/${filename}`;
	const storagePath = `${STORAGE_FOLDER}/${filename}`;

	if (!existsSync(localPath)) {
		console.warn(`  [${id}/${TOTAL}] Skipping ${filename} — not found at ${localPath}`);
		skipped++;
		return;
	}

	const fileBuffer = readFileSync(localPath);

	const { error } = await supabase.storage
		.from(BUCKET)
		.upload(storagePath, fileBuffer, {
			contentType: 'video/mp4',
			upsert: true
		});

	if (error) {
		console.error(`  [${id}/${TOTAL}] FAILED ${filename}: ${error.message}`);
		failed++;
	} else {
		uploaded++;
		const pct = Math.round((uploaded / TOTAL) * 100);
		process.stdout.write(`\r  Uploaded ${uploaded}/${TOTAL} (${pct}%)  `);
	}
}

async function main() {
	console.log(`Uploading ${TOTAL} videos to Supabase Storage...\n`);
	console.log(`  Source:  ${SOURCE_DIR}/`);
	console.log(`  Bucket:  ${BUCKET}/${STORAGE_FOLDER}/\n`);

	// Upload sequentially to avoid overwhelming the API
	for (let i = 1; i <= TOTAL; i++) {
		await uploadVideo(i);
	}

	console.log('\n');
	console.log(`Done!`);
	console.log(`  Uploaded: ${uploaded}`);
	if (skipped > 0) console.log(`  Skipped:  ${skipped}`);
	if (failed > 0) console.log(`  Failed:   ${failed}`);
}

main();
