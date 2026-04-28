import type { PageServerLoad, Actions } from './$types';
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { listExperiments, duplicateExperiment } from '$lib/server/admin';
import { requireExperimentAccess } from '$lib/server/collaborators';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const experiments = await listExperiments(locals.adminUser.id);
	return { experiments };
};

export const actions: Actions = {
	duplicate: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;
		await requireExperimentAccess(locals.adminUser, id, 'viewer');
		try {
			const newExp = await duplicateExperiment(id, locals.adminUser!.id);
			redirect(303, `/admin/experiments/${newExp.id}`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to duplicate.' });
		}
	}
};
