import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { saveConfigWithVersion, ConfigConflictError } from '$lib/server/admin';
import { ExperimentConfigSchema } from '$lib/config/schema';

export const actions: Actions = {
	saveConfig: async ({ request, params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const configJson = formData.get('config') as string;
		const expectedUpdatedAt = (formData.get('expectedUpdatedAt') as string | null) || undefined;

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
			const { updatedAt } = await saveConfigWithVersion(params.id, result.data, {
				newSlug: result.data.slug,
				expectedUpdatedAt
			});
			return { success: true, updatedAt };
		} catch (err) {
			if (err instanceof ConfigConflictError) {
				return fail(409, {
					error:
						'Config was modified by another admin since you loaded this page. Reload to see their changes, then re-apply yours.',
					conflict: true
				});
			}
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to save.' });
		}
	}
};
