import type { Actions } from './$types';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { updateExperiment, deleteExperiment } from '$lib/server/admin';

export const actions: Actions = {
	updateStatus: async ({ request, params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const status = formData.get('status') as string;

		if (!['draft', 'active', 'paused', 'archived'].includes(status)) {
			return fail(400, { error: 'Invalid status.' });
		}

		try {
			await updateExperiment(params.id, { status });
			return { success: true, statusUpdated: true };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update status.' });
		}
	},

	delete: async ({ params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		try {
			await deleteExperiment(params.id);
			redirect(302, '/admin/experiments');
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete.' });
		}
	}
};
