import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { updateExperiment, saveConfigVersion } from '$lib/server/admin';
import { ExperimentConfigSchema } from '$lib/config/schema';

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
	}
};
