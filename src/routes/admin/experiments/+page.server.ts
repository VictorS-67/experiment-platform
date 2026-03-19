import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listExperiments } from '$lib/server/admin';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const experiments = await listExperiments();
	return { experiments };
};
