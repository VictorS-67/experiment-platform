import type { PageServerLoad, Actions } from './$types';
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { getExperiment, getParticipantDetail, deleteParticipant, resetParticipantResponses } from '$lib/server/admin';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.adminUser) error(401, 'Unauthorized');
	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');

	const detail = await getParticipantDetail(params.participantId);
	if (!detail) error(404, 'Participant not found');

	return { experiment, participant: detail.participant, responsesByPhase: detail.responsesByPhase };
};

export const actions: Actions = {
	reset: async ({ params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		try {
			await resetParticipantResponses(params.participantId);
			return { success: true, reset: true };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to reset.' });
		}
	},

	delete: async ({ params, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		try {
			await deleteParticipant(params.participantId);
			redirect(303, `/admin/experiments/${params.id}/data`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete.' });
		}
	}
};
