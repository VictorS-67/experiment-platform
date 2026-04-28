import type { Actions } from './$types';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { duplicateExperiment } from '$lib/server/admin';
import { requireExperimentAccess } from '$lib/server/collaborators';

export const actions: Actions = {
	duplicate: async ({ params, locals }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'viewer');
		try {
			const newExp = await duplicateExperiment(params.id, locals.adminUser!.id);
			redirect(303, `/admin/experiments/${newExp.id}`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to duplicate.' });
		}
	}
};
