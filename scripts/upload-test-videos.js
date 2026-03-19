// Upload test videos from the existing project to Supabase Storage
// Usage: node scripts/upload-test-videos.js
//
// Uploads the first 3 videos from the movement-to-onomatopoeia project
// to: experiments/stimuli/movement-onomatopoeia/

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
// Upload the first 3 videos as a test
const VIDEO_IDS = ['1', '2', '3'];

async function uploadVideo(id) {
	const filename = `${id}.mp4`;
	const localPath = `${SOURCE_DIR}/${filename}`;
	const storagePath = `${STORAGE_FOLDER}/${filename}`;

	if (!existsSync(localPath)) {
		console.warn(`  Skipping ${filename} — not found at ${localPath}`);
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
		console.error(`  Failed to upload ${filename}: ${error.message}`);
	} else {
		const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
		console.log(`  ✓ ${filename} → ${data.publicUrl}`);
	}
}

async function main() {
	console.log(`Uploading ${VIDEO_IDS.length} test videos to Supabase Storage...\n`);

	for (const id of VIDEO_IDS) {
		process.stdout.write(`Uploading ${id}.mp4... `);
		await uploadVideo(id);
	}

	console.log('\nDone! Refresh the survey page to see the videos.');
}

main();
