import type { PageServerLoad } from './$types';
import { getParticipantByToken, loadResponses } from '$lib/server/data';
import { signStimuliUrls, signAudioUrls } from '$lib/server/storage';
import { extractAudioPaths } from '$lib/utils/response-data';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, parent, params }) => {
	const { experiment } = await parent();
	const experimentId = experiment.id;
	const slug = experiment.slug;

	// Check session
	if (!locals.sessionToken) {
		redirect(302, `/e/${slug}`);
	}

	const participant = await getParticipantByToken(locals.sessionToken);
	if (!participant || participant.experiment_id !== experimentId) {
		redirect(302, `/e/${slug}`);
	}

	// Find phase by slug
	const phase = experiment.config.phases?.find(
		(p: { slug: string }) => p.slug === params.phaseSlug
	);
	if (!phase) {
		redirect(302, `/e/${slug}`);
	}

	const participantData = {
		id: participant.id,
		email: participant.email,
		registrationData: participant.registration_data,
		registeredAt: participant.registered_at
	};

	if (phase.type === 'review' && phase.reviewConfig) {
		// Load source phase responses + review phase responses
		const sourceResponses = await loadResponses(
			experimentId,
			participant.id,
			phase.reviewConfig.sourcePhase
		);
		const responses = await loadResponses(experimentId, participant.id, phase.id);
		const [stimuliUrls, audioUrls] = await Promise.all([
			signStimuliUrls(experiment.config.stimuli),
			signAudioUrls(extractAudioPaths([...sourceResponses, ...responses]))
		]);
		return { participant: participantData, responses, sourceResponses, phase, signedUrls: { ...stimuliUrls, ...audioUrls } };
	}

	// Stimulus-response phase
	const responses = await loadResponses(experimentId, participant.id, phase.id);
	const [stimuliUrls, audioUrls] = await Promise.all([
		signStimuliUrls(experiment.config.stimuli),
		signAudioUrls(extractAudioPaths(responses))
	]);
	return { participant: participantData, responses, phase, signedUrls: { ...stimuliUrls, ...audioUrls } };
};
