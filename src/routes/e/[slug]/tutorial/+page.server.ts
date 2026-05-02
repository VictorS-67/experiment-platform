import type { PageServerLoad } from './$types';
import { getParticipantByToken, getParticipantIndex } from '$lib/server/data';
import { signStimuliUrls } from '$lib/server/storage';
import { resolveChunkOrder } from '$lib/utils';
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

	// Compute the per-participant first chunk URL so "Begin Survey" sends the
	// participant to THEIR first chunk in the latin-square / random rotation,
	// not chunks[0]. Without this the tutorial→survey redirect ignored
	// chunkOrder and every participant always landed on chunk-1 first.
	let firstChunkUrl: string | null = null;
	const chunking = experiment.config.stimuli?.chunking;
	if (chunking?.enabled && chunking.chunks?.length > 0) {
		const firstPhaseSlug = experiment.config.phases?.[0]?.slug ?? 'survey';
		const participantIndex = await getParticipantIndex(experiment.id, participant.id);
		const orderedSlugs = resolveChunkOrder(
			chunking.chunks.map((c: { slug: string }) => c.slug),
			(chunking.chunkOrder ?? 'sequential') as 'sequential' | 'latin-square' | 'random-per-participant',
			participantIndex,
			participant.id
		);
		if (orderedSlugs.length > 0) {
			firstChunkUrl = `/e/${slug}/c/${orderedSlugs[0]}/${firstPhaseSlug}`;
		}
	}

	const signedUrls = await signStimuliUrls(experiment.config.stimuli);
	return { participant: participantData, signedUrls, firstChunkUrl };
};
