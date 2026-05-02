import type { PageServerLoad } from './$types';
import { getParticipantByToken, getParticipantIndex, loadResponses } from '$lib/server/data';
import { resolveParticipantNextChunk } from '$lib/server/chunk-routing';
import { redirect } from '@sveltejs/kit';
import type { ExperimentConfig } from '$lib/config/schema';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { experiment } = await parent();
	const slug = experiment.slug;
	const config = experiment.config as ExperimentConfig;

	// Must be authenticated
	if (!locals.sessionToken) {
		redirect(302, `/e/${slug}`);
	}

	const participant = await getParticipantByToken(locals.sessionToken);
	if (!participant || participant.experiment_id !== experiment.id) {
		redirect(302, `/e/${slug}`);
	}

	// Load all responses for this participant
	const allResponses = await loadResponses(experiment.id, participant.id);

	// Defense-in-depth: if the participant lands on `/complete` while still
	// having incomplete chunks (e.g. via a bookmark, manual URL, or post-bug
	// redirect), bounce them back to their next-incomplete chunk in their
	// resolved order. Same logic the login flow uses, so the participant ends
	// up wherever `auth/+server.ts` would have sent them.
	const chunking = config.stimuli?.chunking;
	if (chunking?.enabled && chunking.chunks?.length) {
		const participantIndex = await getParticipantIndex(experiment.id, participant.id);
		const nextChunk = resolveParticipantNextChunk(
			config,
			allResponses,
			slug,
			participant.id,
			participantIndex
		);
		if (nextChunk) {
			redirect(302, nextChunk.url);
		}
	}

	// Check for existing feedback submission
	const existingFeedback = allResponses.find(
		(r) => r.phase_id === '_completion' && r.stimulus_id === '_feedback'
	) ?? null;

	// Build response summary (counts per phase) when showSummary is enabled
	let responseSummary: { phaseId: string; phaseTitle: Record<string, string>; count: number }[] = [];
	if (config.completion?.showSummary) {
		const phaseCounts = new Map<string, number>();
		for (const r of allResponses) {
			if (r.phase_id === '_completion') continue;
			phaseCounts.set(r.phase_id, (phaseCounts.get(r.phase_id) ?? 0) + 1);
		}
		responseSummary = (config.phases ?? []).map((p) => ({
			phaseId: p.id,
			phaseTitle: p.title,
			count: phaseCounts.get(p.id) ?? 0
		}));
	}

	return {
		participant: {
			id: participant.id,
			email: participant.email,
			registrationData: participant.registration_data,
			registeredAt: participant.registered_at
		},
		existingFeedback,
		responseSummary
	};
};
