import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { listConfigVersions, rollbackToVersion } from '$lib/server/admin';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const versions = await listConfigVersions(params.id);
	return { versions };
};

export const actions: Actions = {
	rollback: async ({ request, params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const versionId = formData.get('versionId') as string;
		try {
			await rollbackToVersion(params.id, versionId);
			return { success: true, rolledBack: true };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to rollback.' });
		}
	}
};
