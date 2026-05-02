/**
 * Shared Supabase Storage helpers for ops scripts. Module imports use the
 * `.js` extension because these are run directly via `node` (not bundled).
 */

/**
 * Recursively list every file under `prefix` in a Supabase Storage bucket.
 * Storage list() caps at `limit` per call — paginate via offset until a page
 * returns fewer than the limit. Folder entries (id === null) trigger a
 * recursive call.
 *
 * Returns full paths joined with `/`. Empty prefix lists from the bucket root.
 */
export async function listAll(supabase, bucket, prefix = '') {
	const PAGE = 1000;
	const files = [];
	let offset = 0;
	for (;;) {
		const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset });
		if (error) throw new Error(`storage.list("${prefix}"): ${error.message}`);
		if (!data?.length) break;
		for (const item of data) {
			const path = prefix ? `${prefix}/${item.name}` : item.name;
			if (item.id) {
				// item.id is non-null for files, null for folders
				files.push(path);
			} else {
				files.push(...(await listAll(supabase, bucket, path)));
			}
		}
		if (data.length < PAGE) break;
		offset += PAGE;
	}
	return files;
}
