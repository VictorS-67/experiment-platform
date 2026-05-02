#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local-db', 'utf8');
const url = env.match(/^PUBLIC_SUPABASE_URL=(.+)$/m)?.[1].trim();
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1].trim();
if (!url || !key) {
	console.error('missing env vars in .env.local-db');
	process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const slug = process.argv[2] ?? 'important-moment';
const { data: exp, error } = await supabase
	.from('experiments')
	.select('id, slug, config')
	.eq('slug', slug)
	.single();

if (error) { console.error(error); process.exit(1); }

const ch = exp.config?.stimuli?.chunking;
console.log(`experiment: ${exp.slug}  (id ${exp.id})`);
console.log(`chunking enabled:    ${ch?.enabled}`);
console.log(`chunkOrder:          ${ch?.chunkOrder ?? 'sequential (default)'}`);
console.log(`blockOrder:          ${ch?.blockOrder ?? 'sequential (default)'}`);
console.log(`withinBlockOrder:    ${ch?.withinBlockOrder ?? 'random-per-participant (default)'}`);
console.log(`minBreakMinutes:     ${ch?.minBreakMinutes}`);
console.log(`# chunks:            ${ch?.chunks?.length ?? 0}`);
console.log(`chunk slugs:         ${(ch?.chunks ?? []).map(c => c.slug).join(', ')}`);
console.log(`break disabled:      ${ch?.breakScreen?.disabled === true}`);
console.log(`# phases:            ${exp.config?.phases?.length}`);
console.log(`phase slugs:         ${(exp.config?.phases ?? []).map(p => p.slug).join(', ')}`);

// Show each participant's resolved chunk traversal order.
const { data: participants } = await supabase
	.from('participants')
	.select('id, email, registered_at')
	.eq('experiment_id', exp.id)
	.order('registered_at', { ascending: true });

const slugs = (ch?.chunks ?? []).map(c => c.slug);
function latinSquareOrder(items, idx) {
	if (items.length === 0) return [];
	const offset = ((idx % items.length) + items.length) % items.length;
	return [...items.slice(offset), ...items.slice(0, offset)];
}
// Per-participant per-chunk completion count
const stimulusToChunk = new Map();
for (const c of ch?.chunks ?? []) {
	for (const b of c.blocks ?? []) {
		for (const sid of b.stimulusIds ?? []) stimulusToChunk.set(sid, c.slug);
	}
}

console.log('\nparticipant chunk orderings + completion:');
for (let i = 0; i < (participants ?? []).length; i++) {
	const p = participants[i];
	let order;
	if (ch?.chunkOrder === 'latin-square') order = latinSquareOrder(slugs, i);
	else order = slugs;
	const { data: rs } = await supabase
		.from('responses')
		.select('stimulus_id')
		.eq('participant_id', p.id);
	const completed = new Set();
	for (const r of (rs ?? [])) completed.add(r.stimulus_id);
	const perChunkCompleted = {};
	for (const c of ch.chunks) {
		const ids = c.blocks.flatMap(b => b.stimulusIds ?? []);
		const done = ids.filter(id => completed.has(id)).length;
		perChunkCompleted[c.slug] = `${done}/${ids.length}`;
	}
	console.log(`  [${i}] ${p.email}`);
	console.log(`        order: ${order.join(' → ')}`);
	console.log(`        per-chunk done: ${order.map(s => `${s}=${perChunkCompleted[s]}`).join(', ')}`);
}

