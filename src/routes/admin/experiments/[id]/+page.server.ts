import type { PageServerLoad, Actions } from './$types';
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { getExperiment, updateExperiment, deleteExperiment, duplicateExperiment, saveConfigVersion, listConfigVersions, rollbackToVersion } from '$lib/server/admin';
import { ExperimentConfigSchema } from '$lib/config/schema';
import { getServerSupabase } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');
	const [versions, countResult] = await Promise.all([
		listConfigVersions(params.id),
		getServerSupabase().from('participants').select('id', { count: 'exact', head: true }).eq('experiment_id', params.id)
	]);
	const participantCount = countResult.count ?? 0;
	return { experiment, versions, participantCount };
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
			await saveConfigVersion(params.id, result.data);
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
	},

	duplicate: async ({ params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		try {
			const newExp = await duplicateExperiment(params.id);
			redirect(303, `/admin/experiments/${newExp.id}`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to duplicate.' });
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
