import { resolveChunkOrder } from '$lib/utils';
import { isStimulusDoneInChunk } from '$lib/utils/response-data';
import type { ResponseRecord } from '$lib/services/data';

type ChunkInfo = { slug: string; blocks: Array<{ stimulusIds: string[] }> };
type ChunkOrderMode = 'sequential' | 'latin-square' | 'random-per-participant';
type ChunkingConfig = {
	enabled?: boolean;
	chunks?: ChunkInfo[];
	chunkOrder?: ChunkOrderMode;
	minBreakMinutes?: number;
};
type StimulusItem = { id: string; isAnchor?: boolean };

/** True when chunking is configured AND has at least one chunk. The auth
 *  endpoint and the completion redirect both gate next-chunk computation
 *  on this predicate, so it's centralized to keep the gate consistent. */
export function isChunkingEnabled(
	config: { stimuli?: { chunking?: { enabled?: boolean; chunks?: unknown[] } } }
): boolean {
	const c = config.stimuli?.chunking;
	return !!c?.enabled && (c.chunks?.length ?? 0) > 0;
}

/**
 * Given all responses for a participant, compute the next chunk they should
 * visit. Chunks are traversed in this participant's resolved order
 * (latin-square, random-per-participant, or sequential — depending on config).
 *
 * Returns { url, breakRequired: { canStartAt: ISO string } | null } when
 * there's an incomplete chunk in the participant's order, or null when every
 * chunk has been completed.
 *
 * Used by:
 *   - `/e/[slug]/auth` POST `login` and `register` actions, to compute
 *     `nextChunkUrl` after authentication.
 *   - `/e/[slug]/complete` server load, to redirect a participant who lands
 *     on the completion page prematurely back to their next incomplete chunk.
 */
export function resolveParticipantNextChunk(
	config: { stimuli?: { chunking?: ChunkingConfig; items?: StimulusItem[] }; phases?: Array<{ slug: string }> },
	responses: ResponseRecord[],
	experimentSlug: string,
	participantId: string,
	participantIndex: number
): { url: string; breakRequired: { canStartAt: string } | null } | null {
	const chunking = config.stimuli?.chunking;
	if (!chunking?.enabled || !chunking.chunks?.length) return null;

	const firstPhaseSlug = config.phases?.[0]?.slug ?? 'survey';
	const orderedChunks = resolveChunkOrder(
		chunking.chunks,
		chunking.chunkOrder ?? 'sequential',
		participantIndex,
		participantId
	);

	// Group responses by stimulus so we can ask the shared
	// `isStimulusDoneInChunk` helper "is this stimulus satisfied for this
	// chunk view?" — the helper handles anchor `_chunk` filtering.
	const itemMap = new Map((config.stimuli?.items ?? []).map((s) => [s.id, s]));
	const responsesByStim = new Map<string, ResponseRecord[]>();
	const latestAtByStim = new Map<string, string>();
	for (const r of responses) {
		if (!responsesByStim.has(r.stimulus_id)) responsesByStim.set(r.stimulus_id, []);
		responsesByStim.get(r.stimulus_id)!.push(r);
		const existing = latestAtByStim.get(r.stimulus_id);
		if (!existing || r.created_at > existing) latestAtByStim.set(r.stimulus_id, r.created_at);
	}

	let prevChunkLastResponseAt: string | null = null;

	for (const chunk of orderedChunks) {
		const allStimuli = chunk.blocks.flatMap((b) => b.stimulusIds);
		const isComplete = allStimuli.length > 0 && allStimuli.every((id) => {
			const stim = itemMap.get(id) ?? { isAnchor: false };
			return isStimulusDoneInChunk(stim, chunk.slug, responsesByStim.get(id) ?? []);
		});

		if (!isComplete) {
			const url = `/e/${experimentSlug}/c/${chunk.slug}/${firstPhaseSlug}`;
			let breakRequired: { canStartAt: string } | null = null;
			if (prevChunkLastResponseAt && chunking.minBreakMinutes) {
				const canStartAt = new Date(prevChunkLastResponseAt).getTime() + chunking.minBreakMinutes * 60 * 1000;
				if (canStartAt > Date.now()) {
					breakRequired = { canStartAt: new Date(canStartAt).toISOString() };
				}
			}
			return { url, breakRequired };
		}

		// Track last response time of this completed chunk
		const timestamps = allStimuli.map((id) => latestAtByStim.get(id)!).filter(Boolean);
		if (timestamps.length) {
			const last = timestamps.sort().at(-1)!;
			if (!prevChunkLastResponseAt || last > prevChunkLastResponseAt) prevChunkLastResponseAt = last;
		}
	}

	return null; // all chunks complete
}
