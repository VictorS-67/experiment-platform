import type { PageServerLoad } from './$types';
import {
	getParticipantByToken,
	loadResponses,
	getChunkAssignment,
	saveChunkAssignment,
	getParticipantIndex
} from '$lib/server/data';
import { signStimuliUrls, signAudioUrls } from '$lib/server/storage';
import type { ResponseRecord } from '$lib/services/data';
import { latinSquareOrder, seededShuffle } from '$lib/utils';
import { redirect } from '@sveltejs/kit';

function extractAudioPaths(responses: ResponseRecord[]): string[] {
	const paths: string[] = [];
	for (const r of responses) {
		for (const val of Object.values(r.response_data)) {
			if (typeof val === 'string' && /^audio\/.+\.(webm|mp3|ogg|wav|m4a)$/i.test(val))
				paths.push(val);
		}
	}
	return paths;
}

export const load: PageServerLoad = async ({ locals, parent, params }) => {
	const { experiment } = await parent();
	const experimentId = experiment.id;
	const slug = experiment.slug;
	const chunkSlug = params.chunkSlug;

	// Check session
	if (!locals.sessionToken) {
		redirect(302, `/e/${slug}`);
	}

	const participant = await getParticipantByToken(locals.sessionToken);
	if (!participant || participant.experiment_id !== experimentId) {
		redirect(302, `/e/${slug}`);
	}

	// Find phase
	const phase = experiment.config.phases?.find(
		(p: { slug: string }) => p.slug === params.phaseSlug
	);
	if (!phase) {
		redirect(302, `/e/${slug}`);
	}

	// Resolve chunk config
	const chunking = experiment.config.stimuli.chunking;
	if (!chunking?.enabled) {
		redirect(302, `/e/${slug}/${params.phaseSlug}`);
	}

	const chunk = chunking.chunks.find((c: { slug: string }) => c.slug === chunkSlug);
	if (!chunk) {
		redirect(302, `/e/${slug}`);
	}

	// Get or compute block order assignment for this participant + chunk
	let assignment = await getChunkAssignment(participant.id, chunkSlug);
	if (!assignment) {
		const participantIndex = await getParticipantIndex(experimentId, participant.id);
		let blockOrder: string[];
		if (chunking.blockOrder === 'latin-square') {
			blockOrder = latinSquareOrder(chunk.blocks.map((b: { id: string }) => b.id), participantIndex);
		} else if (chunking.blockOrder === 'random-per-participant') {
			blockOrder = seededShuffle(
				chunk.blocks.map((b: { id: string }) => b.id),
				participant.id + chunkSlug
			);
		} else {
			// sequential
			blockOrder = chunk.blocks.map((b: { id: string }) => b.id);
		}
		await saveChunkAssignment(participant.id, chunkSlug, blockOrder);
		assignment = { blockOrder };
	}

	// Build the ordered stimulus IDs: iterate blocks in assignment order,
	// then apply within-block ordering.
	//
	// For `withinBlockOrder: 'random'` we generate one fresh seed per request
	// and reuse it across all blocks on this page load — that way the shuffle
	// is a proper Fisher-Yates permutation (not the biased Math.random()-0.5
	// sort comparator it used to be) and is stable within the request, but
	// changes on reload for fresh randomness.
	const blockMap = new Map(chunk.blocks.map((b: { id: string; stimulusIds: string[]; label?: Record<string, string> }) => [b.id, b]));
	const orderedStimulusIds: string[] = [];
	const blockBoundaries: { blockId: string; startIndex: number; endIndex: number; label?: Record<string, string> }[] = [];
	const requestRandomSeed = chunking.withinBlockOrder === 'random' ? crypto.randomUUID() : '';
	let offset = 0;
	for (const blockId of assignment.blockOrder) {
		const block = blockMap.get(blockId);
		if (!block) continue;
		let blockStimuli = [...block.stimulusIds];
		if (chunking.withinBlockOrder === 'random-per-participant') {
			blockStimuli = seededShuffle(blockStimuli, participant.id + blockId);
		} else if (chunking.withinBlockOrder === 'random') {
			blockStimuli = seededShuffle(blockStimuli, requestRandomSeed + blockId);
		}
		blockBoundaries.push({ blockId, startIndex: offset, endIndex: offset + blockStimuli.length - 1, label: block.label });
		orderedStimulusIds.push(...blockStimuli);
		offset += blockStimuli.length;
	}

	const participantData = {
		id: participant.id,
		email: participant.email,
		registrationData: participant.registration_data,
		registeredAt: participant.registered_at
	};

	const breakScreen = chunking.breakScreen ?? null;

	if (phase.type === 'review' && phase.reviewConfig) {
		const sourceResponses = await loadResponses(experimentId, participant.id, phase.reviewConfig.sourcePhase);
		const responses = await loadResponses(experimentId, participant.id, phase.id);
		const [stimuliUrls, audioUrls] = await Promise.all([
			signStimuliUrls(experiment.config.stimuli),
			signAudioUrls(extractAudioPaths([...sourceResponses, ...responses]))
		]);
		return { participant: participantData, responses, sourceResponses, phase, orderedStimulusIds, chunkSlug, blockBoundaries, breakScreen, signedUrls: { ...stimuliUrls, ...audioUrls } };
	}

	const responses = await loadResponses(experimentId, participant.id, phase.id);
	const [stimuliUrls, audioUrls] = await Promise.all([
		signStimuliUrls(experiment.config.stimuli),
		signAudioUrls(extractAudioPaths(responses))
	]);
	return { participant: participantData, responses, phase, orderedStimulusIds, chunkSlug, blockBoundaries, breakScreen, signedUrls: { ...stimuliUrls, ...audioUrls } };
};
