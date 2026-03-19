import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getExperiment, getParticipants } from '$lib/server/admin';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');

	const participants = await getParticipants(params.id);

	return { experiment, participants };
};
