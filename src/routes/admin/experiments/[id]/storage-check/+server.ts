import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerSupabase } from '$lib/server/supabase';
import { requireExperimentAccess } from '$lib/server/collaborators';
import { getExperiment } from '$lib/server/admin';

export const GET: RequestHandler = async ({ locals, url, params }) => {
	await requireExperimentAccess(locals.adminUser, params.id, 'viewer');

	const path = url.searchParams.get('path') ?? '';
	if (!path) return json({ count: 0, files: [] });

	// Strip trailing slash + leading bucket prefix.
	const cleanPath = path.replace(/\/+$/, '');
	const bucketPrefix = 'experiments/';
	const listPath = cleanPath.startsWith(bucketPrefix)
		? cleanPath.slice(bucketPrefix.length)
		: cleanPath;

	// Reject path-traversal attempts and absolute-path roots. The Supabase
	// storage SDK doesn't normalize `..`, so an unchecked `stimuli/foo/..`
	// would resolve to the bucket root.
	const segments = listPath.split('/');
	if (segments.some((s) => s === '..' || s === '') || listPath.startsWith('/')) {
		error(400, 'Invalid path');
	}

	// Restrict listing to prefixes the caller's experiment owns. Two roots:
	//   stimuli/<storagePath>/... — admin-set in the experiment config
	//   audio/<experimentId>/...  — programmatic upload target for participants
	// Without this, a viewer on any experiment could enumerate every other
	// experiment's audio uploads (= participant biometric PII filenames).
	const exp = await getExperiment(params.id);
	if (!exp) error(404, 'Experiment not found');
	const configuredStimuliPath = (exp.config?.stimuli?.storagePath ?? '').replace(/\/+$/, '');
	const allowedPrefixes = [
		`audio/${params.id}`,
		...(configuredStimuliPath ? [configuredStimuliPath] : [])
	];
	const isAllowed = allowedPrefixes.some(
		(p) => listPath === p || listPath.startsWith(`${p}/`)
	);
	if (!isAllowed) error(403, 'Path not within this experiment');

	const supabase = getServerSupabase();
	const { data, error: storageError } = await supabase.storage
		.from('experiments')
		.list(listPath, { limit: 200, sortBy: { column: 'name', order: 'asc' } });

	if (storageError) {
		console.error('Storage check error:', storageError);
		return json({ count: 0, files: [], error: 'Could not read storage path' });
	}

	const files = (data ?? [])
		.filter((f) => f.name !== '.emptyFolderPlaceholder')
		.map((f) => f.name);

	return json({ count: files.length, files });
};
