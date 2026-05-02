#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const HEADER = ['id', 'filename', 'performer_origin', 'performer_rank', 'performer_id', 'emotion', 'take', 'intensity'];

// Filenames look like:
//   JP_06_anger_1_L_trim_00_000_01.mp4   (origin_perfId_emotion_take_intensity_trim_...)
//   TW_01_anger_1_H.bvh_00_000_01.mp4    (origin_perfId_emotion_take_intensity.bvh_...)
function parseStimulus(filename) {
	const m = filename.match(/^(JP|TW)_([^_]+)_([^_]+)_([^_]+)_([^_.]+)/);
	if (!m) return null;
	return { performer_id: m[2], emotion: m[3], take: m[4], intensity: m[5] };
}

const sources = readdirSync(ROOT)
	.filter((f) => /^Summary_.*\.csv$/.test(f))
	.sort();

const seen = new Set();
const rows = [];

for (const file of sources) {
	const meta = file.match(/^Summary_(JP|TW)Performer_(top25|bottom25)\.csv$/);
	if (!meta) {
		console.warn(`skip (unexpected name): ${file}`);
		continue;
	}
	const performer_origin = meta[1];
	const performer_rank = meta[2];

	const text = readFileSync(join(ROOT, file), 'utf8');
	const lines = text.split(/\r?\n/);
	let isHeader = true;

	for (const raw of lines) {
		const line = raw.replace(/,+\s*$/, '').trim();
		if (!line) continue;
		if (isHeader) {
			isHeader = false;
			if (line.toLowerCase().startsWith('stimulus')) continue;
		}
		const original = line;
		const parsed = parseStimulus(original);
		if (!parsed) {
			console.warn(`skip (unparsable): ${original}`);
			continue;
		}
		const filename = `f_${performer_origin}_${parsed.performer_id}_${parsed.emotion}_${parsed.take}_${parsed.intensity}.mp4`;
		if (seen.has(filename)) continue;
		seen.add(filename);
		const id = `s${String(rows.length + 1).padStart(4, '0')}`;
		rows.push({ id, filename, performer_origin, performer_rank, ...parsed });
	}
}

const csv = [
	HEADER.join(','),
	...rows.map((r) => HEADER.map((k) => r[k] ?? '').join(','))
].join('\n');

const out = join(ROOT, 'stimuli_combined.csv');
writeFileSync(out, csv + '\n');

console.log(`wrote ${rows.length} rows to ${out}`);
console.log(`sources: ${sources.join(', ')}`);
