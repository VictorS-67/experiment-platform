import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getExperiment } from '$lib/server/admin';
import { getServerSupabase } from '$lib/server/supabase';
import { requireExperimentAccess } from '$lib/server/collaborators';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	// `viewer` is the minimum: a user must be a collaborator at any level to
	// see this experiment exists. Routes nested under this layout enforce
	// stricter roles where needed (editor for config/data, owner for delete).
	const myRole = await requireExperimentAccess(locals.adminUser, params.id, 'viewer');

	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');

	const { count } = await getServerSupabase()
		.from('participants')
		.select('id', { count: 'exact', head: true })
		.eq('experiment_id', params.id);

	return {
		experiment,
		participantCount: count ?? 0,
		myRole,
		adminUserId: locals.adminUser!.id
	};
};
