import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSupabase } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');

	const path = url.searchParams.get('path') ?? '';
	if (!path) return json({ count: 0, files: [] });

	// Strip trailing slash — Supabase Storage list() doesn't want it
	const cleanPath = path.replace(/\/+$/, '');

	// Strip the bucket name prefix if present (storagePath in config may include it)
	const bucketPrefix = 'experiments/';
	const listPath = cleanPath.startsWith(bucketPrefix)
		? cleanPath.slice(bucketPrefix.length)
		: cleanPath;

	const supabase = getServerSupabase();
	const { data, error: storageError } = await supabase.storage
		.from('experiments')
		.list(listPath, { limit: 200, sortBy: { column: 'name', order: 'asc' } });

	if (storageError) {
		console.error('Storage check error:', storageError);
		return json({ count: 0, files: [], error: 'Could not read storage path' });
	}

	// Filter out the placeholder .emptyFolderPlaceholder that Supabase sometimes inserts
	const files = (data ?? [])
		.filter((f) => f.name !== '.emptyFolderPlaceholder')
		.map((f) => f.name);

	return json({ count: files.length, files });
};
