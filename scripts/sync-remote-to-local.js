/**
 * sync-remote-to-local.js — Copies all data from the remote (online) Supabase
 * into your local Supabase instance so you can debug production issues locally.
 *
 * Prerequisites:
 *   supabase start     (local instance must be running)
 *   .env.local-db      (must contain PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for local)
 *
 * Usage:
 *   node scripts/sync-remote-to-local.js [options]
 *
 * Options:
 *   --storage                      Also sync files in the 'experiments' storage bucket
 *   --admin-email=foo@example.com  Local admin account to create (default: debug@local.dev)
 *   --admin-password=secret        Local admin password (default: Debug1234!)
 *
 * After running, start the dev server:
 *   npm run dev:local
 *   → http://localhost:5173/admin  (log in with the admin credentials printed at the end)
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { listAll } from './storage-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ── Environment ───────────────────────────────────────────────────────────────

loadEnv({ path: resolve(root, '.env') });
const remoteUrl = process.env.PUBLIC_SUPABASE_URL;
const remoteKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let localEnv = {};
try {
	localEnv = parseEnv(readFileSync(resolve(root, '.env.local-db'), 'utf-8'));
} catch {
	console.error('❌  .env.local-db not found. Run `supabase start` and create the file first.');
	process.exit(1);
}

const localUrl = localEnv.PUBLIC_SUPABASE_URL;
const localKey = localEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!remoteUrl || !remoteKey) {
	console.error('❌  Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(1);
}
if (!localUrl || !localKey) {
	console.error('❌  Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local-db');
	process.exit(1);
}

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(localUrl);
if (!isLocal) {
	console.error(
		`❌  LOCAL_URL doesn't look local: ${localUrl}\n    Refusing to overwrite a non-local database.`
	);
	process.exit(1);
}

const syncStorage = process.argv.includes('--storage');
const adminEmail =
	process.argv.find((a) => a.startsWith('--admin-email='))?.split('=')[1] ?? 'debug@local.dev';
const adminPassword =
	process.argv.find((a) => a.startsWith('--admin-password='))?.split('=')[1] ?? 'Debug1234!';

// ── Clients ───────────────────────────────────────────────────────────────────

const remote = createClient(remoteUrl, remoteKey, { auth: { persistSession: false } });
const local = createClient(localUrl, localKey, { auth: { persistSession: false } });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch every row from a table, paginating in batches of 1 000. */
async function fetchAll(client, table) {
	const PAGE = 1000;
	const rows = [];
	let from = 0;
	for (;;) {
		const { data, error } = await client.from(table).select('*').range(from, from + PAGE - 1);
		if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
		if (!data?.length) break;
		rows.push(...data);
		if (data.length < PAGE) break;
		from += PAGE;
	}
	return rows;
}

/** Insert rows in chunks of 200 to stay under request-size limits. */
async function insertAll(client, table, rows) {
	if (!rows.length) {
		console.log(`  ${table}: 0 rows`);
		return;
	}
	const CHUNK = 200;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const { error } = await client.from(table).insert(rows.slice(i, i + CHUNK));
		if (error) throw new Error(`insertAll(${table}): ${error.message}`);
	}
	console.log(`  ${table}: ${rows.length} rows`);
}

/** Delete all rows from a table that has a UUID `id` column. */
async function clearById(client, table) {
	const { error } = await client
		.from(table)
		.delete()
		.gte('id', '00000000-0000-0000-0000-000000000000');
	if (error) throw new Error(`clear(${table}): ${error.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	console.log('\n🔄  Syncing remote → local');
	console.log(`    Remote: ${remoteUrl}`);
	console.log(`    Local:  ${localUrl}\n`);

	// ── 1. Fetch all remote data upfront ──────────────────────────────────────
	console.log('📥  Fetching remote data...');

	const [experiments, participants, responses, configVersions, fileUploads, pendingInvites] =
		await Promise.all([
			fetchAll(remote, 'experiments'),
			fetchAll(remote, 'participants'),
			fetchAll(remote, 'responses'),
			fetchAll(remote, 'experiment_config_versions'),
			fetchAll(remote, 'file_uploads'),
			fetchAll(remote, 'pending_invites'),
		]);

	console.log(`  experiments=${experiments.length}  participants=${participants.length}  responses=${responses.length}`);
	console.log(`  config_versions=${configVersions.length}  file_uploads=${fileUploads.length}  pending_invites=${pendingInvites.length}`);

	// ── 2. Clear local data (children before parents) ─────────────────────────
	console.log('\n🗑️   Clearing local tables...');

	// file_uploads → responses → participants → experiment_config_versions → experiments
	// pending_invites → experiments
	// experiment_collaborators → experiments + admin_users → auth.users
	await clearById(local, 'file_uploads');
	await clearById(local, 'responses');
	await clearById(local, 'participants');
	await clearById(local, 'experiment_config_versions');
	await clearById(local, 'pending_invites');

	// experiment_collaborators has a composite PK; delete via experiment_id
	await local
		.from('experiment_collaborators')
		.delete()
		.gte('experiment_id', '00000000-0000-0000-0000-000000000000');

	await clearById(local, 'experiments');

	// admin_users PK is user_id (not id)
	await local
		.from('admin_users')
		.delete()
		.gte('user_id', '00000000-0000-0000-0000-000000000000');

	// ── 3. Insert data (parents before children) ──────────────────────────────
	console.log('\n📤  Inserting into local...');

	await insertAll(local, 'experiments', experiments);
	await insertAll(local, 'experiment_config_versions', configVersions);
	await insertAll(local, 'participants', participants);
	await insertAll(local, 'responses', responses);
	await insertAll(local, 'file_uploads', fileUploads);
	await insertAll(local, 'pending_invites', pendingInvites);

	// ── 4. Set up a local admin user ──────────────────────────────────────────
	console.log('\n👤  Setting up local admin...');

	let adminUserId;

	const { data: created, error: createErr } = await local.auth.admin.createUser({
		email: adminEmail,
		password: adminPassword,
		email_confirm: true,
	});

	if (createErr) {
		// User already exists — find them and update the password
		if (
			createErr.message.includes('already been registered') ||
			createErr.code === 'email_exists' ||
			createErr.status === 422
		) {
			const { data: list } = await local.auth.admin.listUsers();
			const existing = list?.users?.find((u) => u.email === adminEmail);
			if (!existing) throw new Error(`Admin ${adminEmail} exists but cannot be fetched`);
			adminUserId = existing.id;
			await local.auth.admin.updateUserById(adminUserId, { password: adminPassword });
			console.log(`  Reusing existing auth user: ${adminEmail}`);
		} else {
			throw new Error(`createUser: ${createErr.message}`);
		}
	} else {
		adminUserId = created.user.id;
		console.log(`  Created auth user: ${adminEmail} (${adminUserId})`);
	}

	// Insert into admin_users (only columns that exist in the schema)
	const { error: auErr } = await local
		.from('admin_users')
		.upsert({ user_id: adminUserId }, { onConflict: 'user_id' });
	if (auErr) throw new Error(`admin_users upsert: ${auErr.message}`);

	// Add as owner of every experiment
	if (experiments.length) {
		const collabRows = experiments.map((e) => ({
			experiment_id: e.id,
			user_id: adminUserId,
			role: 'owner',
		}));
		const { error: collabErr } = await local
			.from('experiment_collaborators')
			.upsert(collabRows, { onConflict: 'experiment_id,user_id' });
		if (collabErr) throw new Error(`experiment_collaborators upsert: ${collabErr.message}`);
		console.log(`  Granted owner access to ${experiments.length} experiments`);
	}

	// ── 5. Optional storage sync ───────────────────────────────────────────────
	if (syncStorage) {
		console.log('\n📦  Syncing storage bucket "experiments"...');
		await syncStorageBucket();
	} else {
		console.log('\n    (storage not synced — re-run with --storage to include uploaded files)');
	}

	// ── Done ──────────────────────────────────────────────────────────────────
	console.log('\n✅  Sync complete!\n');
	console.log('    Next steps:');
	console.log('      npm run dev:local');
	console.log(`      http://localhost:5173/admin`);
	console.log(`      Email:    ${adminEmail}`);
	console.log(`      Password: ${adminPassword}\n`);
}

// ── Storage sync ──────────────────────────────────────────────────────────────

async function syncStorageBucket() {
	const BUCKET = 'experiments';

	// Ensure the local bucket exists and is private (matching production)
	const { error: bucketErr } = await local.storage.createBucket(BUCKET, { public: false });
	if (bucketErr) {
		if (!bucketErr.message.toLowerCase().includes('already exists')) {
			throw new Error(`createBucket: ${bucketErr.message}`);
		}
		// Bucket already exists — ensure it's private to match production
		const { error: updateErr } = await local.storage.updateBucket(BUCKET, { public: false });
		if (updateErr) throw new Error(`updateBucket: ${updateErr.message}`);
	}

	const files = await listAll(remote, BUCKET);
	console.log(`  Found ${files.length} files`);

	let copied = 0;
	let skipped = 0;
	for (const path of files) {
		const { data, error: dlErr } = await remote.storage.from(BUCKET).download(path);
		if (dlErr) {
			console.warn(`  ⚠  download failed: ${path} — ${dlErr.message}`);
			skipped++;
			continue;
		}
		const { error: ulErr } = await local.storage.from(BUCKET).upload(path, data, { upsert: true });
		if (ulErr) {
			console.warn(`  ⚠  upload failed:   ${path} — ${ulErr.message}`);
			skipped++;
			continue;
		}
		copied++;
		if (copied % 20 === 0) process.stdout.write(`  ... ${copied}/${files.length}\r`);
	}
	console.log(`  Copied ${copied} files${skipped ? `, skipped ${skipped}` : ''}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((err) => {
	console.error('\n❌  Sync failed:', err.message);
	process.exit(1);
});
