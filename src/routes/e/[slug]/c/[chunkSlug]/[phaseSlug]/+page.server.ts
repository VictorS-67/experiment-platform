import type { PageServerLoad } from './$types';
import {
	getParticipantByToken,
	loadResponses,
	getChunkAssignment,
	saveChunkAssignment,
	getParticipantIndex
} from '$lib/server/data';
import { signStimuliUrls, signAudioUrls } from '$lib/server/storage';
import { extractAudioPaths, isStimulusDoneInChunk } from '$lib/utils/response-data';
import { latinSquareOrder, seededShuffle, resolveChunkOrder } from '$lib/utils';
import { redirect } from '@sveltejs/kit';

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

	// Participant index is needed for both block-order latin-square AND for
	// per-participant chunk-order resolution. Compute once.
	const participantIndex = await getParticipantIndex(experimentId, participant.id);

	// Get or compute block order assignment for this participant + chunk
	let assignment = await getChunkAssignment(participant.id, chunkSlug);
	if (!assignment) {
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

	// Per-participant chunk order — used by the phase-completion modal to link
	// to the *next chunk in this participant's traversal*, not chunks[idx+1].
	const orderedChunkSlugs = resolveChunkOrder(
		chunking.chunks.map((c: { slug: string }) => c.slug),
		(chunking.chunkOrder ?? 'sequential') as 'sequential' | 'latin-square' | 'random-per-participant',
		participantIndex,
		participant.id
	);

	// Mid-chunk drop-off detection — used to show a "Welcome back" screen on
	// re-entry when 0 < completed < total stimuli for this chunk. Anchor-aware
	// via `isStimulusDoneInChunk`: an anchor rated in a *different* chunk does
	// NOT count toward this chunk's progress (otherwise a freshly-entered chunk
	// would show "4/126 — welcome back" the moment it opens).
	const itemMap = new Map(
		(experiment.config.stimuli?.items ?? []).map((s: { id: string; isAnchor?: boolean }) => [s.id, s])
	);
	const allParticipantResponses = await loadResponses(experimentId, participant.id);
	const responsesByStim = new Map<string, typeof allParticipantResponses>();
	for (const r of allParticipantResponses) {
		const arr = responsesByStim.get(r.stimulus_id) ?? [];
		arr.push(r);
		responsesByStim.set(r.stimulus_id, arr);
	}
	let completedCount = 0;
	for (const id of orderedStimulusIds) {
		const stim = itemMap.get(id) ?? { id, isAnchor: false };
		if (isStimulusDoneInChunk(stim, chunkSlug, responsesByStim.get(id) ?? [])) {
			completedCount++;
		}
	}
	const totalCount = orderedStimulusIds.length;
	const resumeContext =
		completedCount > 0 && completedCount < totalCount
			? { completed: completedCount, total: totalCount }
			: null;

	if (phase.type === 'review' && phase.reviewConfig) {
		const sourceResponses = await loadResponses(experimentId, participant.id, phase.reviewConfig.sourcePhase);
		const responses = await loadResponses(experimentId, participant.id, phase.id);
		const [stimuliUrls, audioUrls] = await Promise.all([
			signStimuliUrls(experiment.config.stimuli),
			signAudioUrls(extractAudioPaths([...sourceResponses, ...responses]))
		]);
		return { participant: participantData, responses, sourceResponses, phase, orderedStimulusIds, chunkSlug, blockBoundaries, breakScreen, orderedChunkSlugs, resumeContext, signedUrls: { ...stimuliUrls, ...audioUrls } };
	}

	const responses = await loadResponses(experimentId, participant.id, phase.id);
	const [stimuliUrls, audioUrls] = await Promise.all([
		signStimuliUrls(experiment.config.stimuli),
		signAudioUrls(extractAudioPaths(responses))
	]);
	return { participant: participantData, responses, phase, orderedStimulusIds, chunkSlug, blockBoundaries, breakScreen, orderedChunkSlugs, resumeContext, signedUrls: { ...stimuliUrls, ...audioUrls } };
};
