import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { listConfigVersions, rollbackToVersion, ConfigConflictError } from '$lib/server/admin';
import { requireExperimentAccess } from '$lib/server/collaborators';

export const load: PageServerLoad = async ({ params, locals }) => {
	await requireExperimentAccess(locals.adminUser, params.id, 'viewer');
	const versions = await listConfigVersions(params.id);
	return { versions };
};

export const actions: Actions = {
	rollback: async ({ request, params, locals }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'editor');
		const formData = await request.formData();
		const versionId = formData.get('versionId') as string;
		const expectedUpdatedAt = (formData.get('expectedUpdatedAt') as string | null) || undefined;
		try {
			await rollbackToVersion(params.id, versionId, { expectedUpdatedAt });
			return { success: true, rolledBack: true };
		} catch (err) {
			if (err instanceof ConfigConflictError) {
				return fail(409, {
					error:
						'Config was modified by another admin since you loaded this page. Reload and try again.',
					conflict: true
				});
			}
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to rollback.' });
		}
	}
};
