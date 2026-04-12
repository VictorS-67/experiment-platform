import type { Actions } from './$types';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { duplicateExperiment } from '$lib/server/admin';

export const actions: Actions = {
	duplicate: async ({ params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		try {
			const newExp = await duplicateExperiment(params.id);
			redirect(303, `/admin/experiments/${newExp.id}`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to duplicate.' });
		}
	}
};
