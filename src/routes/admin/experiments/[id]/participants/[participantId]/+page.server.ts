import type { PageServerLoad, Actions } from './$types';
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { getExperiment, getParticipantDetail, deleteParticipant, resetParticipantResponses, getParticipantSessionTimings } from '$lib/server/admin';
import { requireExperimentAccess } from '$lib/server/collaborators';
import { logAdminAction } from '$lib/server/audit';
import { signAudioUrls } from '$lib/server/storage';
import { isAudioPath } from '$lib/utils/response-data';

export const load: PageServerLoad = async ({ params, locals }) => {
	await requireExperimentAccess(locals.adminUser, params.id, 'viewer');

	const experiment = await getExperiment(params.id);
	if (!experiment) error(404, 'Experiment not found');

	// Pass params.id so getParticipantDetail rejects participants from other
	// experiments — closes the audit's H3 IDOR.
	const detail = await getParticipantDetail(params.participantId, params.id);
	if (!detail) error(404, 'Participant not found');

	const audioPaths: string[] = [];
	for (const responses of Object.values(detail.responsesByPhase)) {
		for (const r of responses) {
			for (const val of Object.values(r.responseData)) {
				if (isAudioPath(val)) audioPaths.push(val);
			}
		}
	}
	const signedAudioUrls = await signAudioUrls([...new Set(audioPaths)]);

	// Per-chunk session timings (start/end/duration) for payment tracking on
	// multi-session studies. Empty array when the experiment has no chunking.
	const sessionTimings = await getParticipantSessionTimings(params.id, params.participantId);

	return { experiment, participant: detail.participant, responsesByPhase: detail.responsesByPhase, signedAudioUrls, sessionTimings };
};

export const actions: Actions = {
	reset: async ({ params, locals, getClientAddress }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'editor');
		const detail = await getParticipantDetail(params.participantId, params.id);
		if (!detail) error(404, 'Participant not found');
		try {
			await resetParticipantResponses(params.id, params.participantId);
			await logAdminAction({
				adminUserId: locals.adminUser!.id,
				adminEmail: locals.adminUser!.email,
				experimentId: params.id,
				action: 'participant.reset_responses',
				resourceType: 'participant',
				resourceId: params.participantId,
				ip: getClientAddress()
			});
			return { success: true, reset: true };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to reset.' });
		}
	},

	delete: async ({ params, locals, getClientAddress }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'editor');
		const detail = await getParticipantDetail(params.participantId, params.id);
		if (!detail) error(404, 'Participant not found');
		try {
			await deleteParticipant(params.id, params.participantId);
			await logAdminAction({
				adminUserId: locals.adminUser!.id,
				adminEmail: locals.adminUser!.email,
				experimentId: params.id,
				action: 'participant.delete',
				resourceType: 'participant',
				resourceId: params.participantId,
				ip: getClientAddress()
			});
			redirect(303, `/admin/experiments/${params.id}/data`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete.' });
		}
	}
};
