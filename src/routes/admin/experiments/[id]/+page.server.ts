import type { PageServerLoad, Actions } from './$types';
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { getExperiment, updateExperiment, deleteExperiment } from '$lib/server/admin';
import { ExperimentConfigSchema } from '$lib/config/schema';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');
	return { experiment };
};

export const actions: Actions = {
	saveConfig: async ({ request, params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const configJson = formData.get('config') as string;

		let parsed: unknown;
		try {
			parsed = JSON.parse(configJson);
		} catch {
			return fail(400, { error: 'Invalid JSON syntax.' });
		}

		const result = ExperimentConfigSchema.safeParse(parsed);
		if (!result.success) {
			const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
			return fail(400, { error: `Validation failed:\n${issues}` });
		}

		try {
			await updateExperiment(params.id, { config: result.data, slug: result.data.slug });
			return { success: true };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to save.' });
		}
	},

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
