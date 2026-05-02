/**
 * Helpers for working with the `response_data` JSONB blob — separating
 * widget answers (user-defined keys) from platform-injected sentinels
 * (`_`-prefix: `_chunk`, `_timestamp`, …) and computing chunk-aware
 * completion for anchor stimuli that recur across chunks.
 *
 * Use these consistently across client and server code so anchor /
 * sentinel semantics live in one place.
 */

type ResponseDataLike = { response_data: Record<string, unknown> };

/**
 * Single source of truth for "is this string an audio storage path?".
 * Audio uploads land at `audio/<exp>/<participant>/<stim>/<widget>_<ts>.<ext>`,
 * so a path-shaped value with one of the recorder MIME extensions is treated
 * as audio. Used by participant + admin views to decide whether to render an
 * <audio> element vs plain text, and by the load-time URL signer.
 */
export const AUDIO_PATH_PATTERN = /^audio\/.+\.(webm|mp3|ogg|wav|m4a)$/i;

export function isAudioPath(v: unknown): v is string {
	return typeof v === 'string' && AUDIO_PATH_PATTERN.test(v);
}

/** Collect every audio path appearing in any response's widget answers,
 *  excluding sentinel keys. Used to batch-sign URLs server-side. */
export function extractAudioPaths(responses: ResponseDataLike[]): string[] {
	const paths: string[] = [];
	for (const r of responses) {
		for (const val of Object.values(r.response_data)) {
			if (isAudioPath(val)) paths.push(val);
		}
	}
	return paths;
}

/** Iterate widget answer entries from `response_data`, excluding sentinel
 * `_`-prefix keys. Replaces hand-listed `k !== '_timestamp'` patterns. */
export function widgetEntries(rd: Record<string, unknown>): Array<[string, unknown]> {
	return Object.entries(rd).filter(([k]) => !k.startsWith('_'));
}

/** Widget answer keys only (no sentinels). */
export function widgetKeys(rd: Record<string, unknown>): string[] {
	return Object.keys(rd).filter((k) => !k.startsWith('_'));
}

/** True when every widget answer is null/'null' (gatekeeper-No skip row,
 * auto-skip-by-rule sentinel value, etc.). Sentinels are excluded from
 * the check.
 *
 * Returns false for an empty widget set so that responses with only
 * sentinels (theoretical, shouldn't happen in practice) don't accidentally
 * report as "skipped". */
export function isAllNullResponse(rd: Record<string, unknown>): boolean {
	const entries = widgetEntries(rd);
	return entries.length > 0 && entries.every(([, v]) => v === null || v === 'null');
}

/**
 * Filter `responses` to those that count for the given chunk view.
 *
 * - Non-anchor stimuli: every response counts (they only appear in one chunk).
 * - Anchor stimuli on a chunked route: only responses with `_chunk === chunkSlug`
 *   count. STRICT — legacy responses without `_chunk` are NOT tolerantly
 *   accepted, because crediting an untagged anchor response to every chunk
 *   would silently regress test-retest reliability (the whole point of
 *   anchors). Launch policy is "reset participants and re-run" before relying
 *   on anchor data; legacy participants will be re-prompted for anchors
 *   in every chunk visit, which is the correct test-retest behaviour anyway.
 * - Non-chunked routes (chunkSlug undefined): every response counts. Anchors
 *   on non-chunked phases behave as regular stimuli.
 *
 * The same semantic is reused as test-retest blinding (hiding prior-chunk
 * anchor ratings from the rater to keep their fresh judgment uninfluenced),
 * so callers don't need a second strict-mode helper.
 */
export function inScopeForChunk<T extends ResponseDataLike>(
	item: { isAnchor?: boolean },
	chunkSlug: string | undefined,
	responses: T[]
): T[] {
	if (!item.isAnchor || !chunkSlug) return responses;
	return responses.filter((r) => r.response_data._chunk === chunkSlug);
}

/** Is this stimulus considered done in the given chunk view? */
export function isStimulusDoneInChunk(
	item: { isAnchor?: boolean },
	chunkSlug: string | undefined,
	responses: ResponseDataLike[]
): boolean {
	return inScopeForChunk(item, chunkSlug, responses).length > 0;
}
