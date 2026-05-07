import type { PageServerLoad, Actions } from './$types';
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { getParticipantDetail, deleteParticipant, resetParticipantResponses, computeSessionTimings } from '$lib/server/admin';
import { requireExperimentAccess } from '$lib/server/collaborators';
import { logAdminAction } from '$lib/server/audit';
import { signAudioUrls } from '$lib/server/storage';
import { isAudioPath } from '$lib/utils/response-data';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	await requireExperimentAccess(locals.adminUser, params.id, 'viewer');

	// `experiment` is already loaded by the layout — re-fetching it here would
	// pull the full config JSONB a second time per page hit. Pull from parent().
	const { experiment } = await parent();

	// Pass params.id so getParticipantDetail rejects participants from other
	// experiments — closes the audit's H3 IDOR.
	const detail = await getParticipantDetail(params.participantId, params.id);
	if (!detail) error(404, 'Participant not found');

	const audioPaths: string[] = [];
	const flatResponses: Array<{ stimulusId: string; responseData: Record<string, unknown>; createdAt: string }> = [];
	for (const responses of Object.values(detail.responsesByPhase)) {
		for (const r of responses) {
			flatResponses.push({ stimulusId: r.stimulusId, responseData: r.responseData, createdAt: r.createdAt });
			for (const val of Object.values(r.responseData)) {
				if (isAudioPath(val)) audioPaths.push(val);
			}
		}
	}
	const signedAudioUrls = await signAudioUrls([...new Set(audioPaths)]);

	// Per-chunk session timings (start/end/duration) for payment tracking on
	// multi-session studies. Empty array when the experiment has no chunking.
	// Computed in-process from the responses already fetched above — no extra
	// `experiments` SELECT and no extra `responses` SELECT.
	const sessionTimings = computeSessionTimings(experiment.config, flatResponses);

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
