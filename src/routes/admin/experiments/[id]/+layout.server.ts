import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getExperiment } from '$lib/server/admin';
import { getServerSupabase } from '$lib/server/supabase';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');

	const { count } = await getServerSupabase()
		.from('participants')
		.select('id', { count: 'exact', head: true })
		.eq('experiment_id', params.id);

	return {
		experiment,
		participantCount: count ?? 0
	};
};
