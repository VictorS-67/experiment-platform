#!/usr/bin/env node
// List files under a storage prefix. Usage: node scripts/list-storage.js [prefix]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { listAll } from './storage-utils.js';

const env = readFileSync('.env', 'utf8');
const url = env.match(/^PUBLIC_SUPABASE_URL=(.+)$/m)?.[1].trim();
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1].trim();
if (!url || !key) throw new Error('missing env vars');

const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'experiments';
// Strip trailing slash — listAll() joins path segments itself.
const prefix = (process.argv[2] ?? 'stimuli/').replace(/\/+$/, '');

const files = await listAll(supabase, BUCKET, prefix);
console.log(`bucket: ${BUCKET}, prefix: ${prefix}, total: ${files.length}`);
for (const f of files.slice(0, 20)) console.log(' ', f);
if (files.length > 20) console.log(`  …(${files.length - 20} more)`);
