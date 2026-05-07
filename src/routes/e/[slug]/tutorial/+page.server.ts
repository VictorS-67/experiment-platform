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

	// On slow internet (Slow 3G testing) the participant was waiting ~35 s for
	// the tutorial intro modal to appear — they were blocked on signed URL
	// signing and chunk-routing work that the modal itself doesn't need. Both
	// are returned as un-awaited promises so SvelteKit streams them: the page
	// renders synchronously with `participant`, the modal pops immediately,
	// and the sample-video / firstChunkUrl resolve while the participant reads.

	// Sign only the tutorial's sample stimulus URLs — not every stimulus in
	// the experiment. For a 5-stimulus experiment this drops the signing batch
	// from 5 paths to 1, and that one path's signed URL is what the tutorial
	// page actually renders.
	const sampleIds = new Set<string>(experiment.config.tutorial.sampleStimuliIds ?? []);
	if (sampleIds.size === 0 && experiment.config.stimuli.items.length > 0) {
		// Fallback: if no sample stimuli are configured, the tutorial uses
		// items[0] (see +page.svelte's `sampleItem` derivation). Sign that one.
		sampleIds.add(experiment.config.stimuli.items[0].id);
	}
	const signedUrls = signStimuliUrls(experiment.config.stimuli, 7200, sampleIds);

	const chunking = experiment.config.stimuli?.chunking;
	const firstChunkUrl: Promise<string | null> = (async () => {
		if (!chunking?.enabled || (chunking.chunks?.length ?? 0) === 0) return null;
		const firstPhaseSlug = experiment.config.phases?.[0]?.slug ?? 'survey';
		const participantIndex = await getParticipantIndex(experiment.id, participant.id);
		const orderedSlugs = resolveChunkOrder(
			chunking.chunks.map((c: { slug: string }) => c.slug),
			(chunking.chunkOrder ?? 'sequential') as 'sequential' | 'latin-square' | 'random-per-participant',
			participantIndex,
			participant.id
		);
		return orderedSlugs.length > 0 ? `/e/${slug}/c/${orderedSlugs[0]}/${firstPhaseSlug}` : null;
	})();

	return { participant: participantData, signedUrls, firstChunkUrl };
};
