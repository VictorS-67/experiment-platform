import type { PageServerLoad } from './$types';
import { getParticipantByToken } from '$lib/server/data';
import { signStimuliUrls } from '$lib/server/storage';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { experiment } = await parent();
	const slug = experiment.slug;

	// No tutorial configured — skip to first phase
	if (!experiment.config.tutorial) {
		const firstPhase = experiment.config.phases[0];
		redirect(302, `/e/${slug}/${firstPhase?.slug ?? 'survey'}`);
	}

	// Check session
	if (!locals.sessionToken) {
		redirect(302, `/e/${slug}`);
	}

	const participant = await getParticipantByToken(locals.sessionToken);
	if (!participant || participant.experiment_id !== experiment.id) {
		redirect(302, `/e/${slug}`);
	}

	const participantData = {
		id: participant.id,
		email: participant.email,
		registrationData: participant.registration_data,
		registeredAt: participant.registered_at
	};

	const signedUrls = await signStimuliUrls(experiment.config.stimuli);
	return { participant: participantData, signedUrls };
};
