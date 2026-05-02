/**
 * Response-save pipeline extracted from /e/[slug]/[phaseSlug]/+page.svelte.
 *
 * The page used to inline ~100 lines of validation, audio upload, response-
 * data assembly, and POST plumbing inside two near-duplicate handlers
 * (handleSave / handleNo). Splitting them out:
 *   - lets us unit-test the pure pieces (validation, payload assembly)
 *     without spinning up a SvelteKit page
 *   - keeps the audio-upload + response-save sequence intact (transactional
 *     contract: a failed audio upload must NOT save a half-formed response)
 *   - leaves all UI state (saving flag, message toast) in the page, where
 *     it belongs
 */

import type { ResponseRecord } from '$lib/services/data';

// Structural type — matches both the schema-derived strict ResponseWidgetType
// and the loose objects we use in tests. Generic <W> threads the caller's
// concrete type through `ValidationError.widget` so callers can read fields
// like `label` without re-casting.
type WidgetLike = {
	id: string;
	type: string;
	required?: boolean;
	conditionalOn?: { widgetId: string; value: string };
};

export type ValidationError<W extends WidgetLike> =
	| { kind: 'required'; widget: W }
	| { kind: 'timestamp_order'; widget: W };

/** Return the first failed validation, or null if every required+visible
 *  widget has a usable value. Pure function — no side effects, no toasts. */
export function validateWidgets<W extends WidgetLike>(
	widgets: W[],
	values: Record<string, unknown>,
	isVisible: (w: W) => boolean
): ValidationError<W> | null {
	for (const w of widgets) {
		if (!w.required) continue;
		if (!isVisible(w)) continue;
		if (w.type === 'timestamp-range') {
			const [start, end] = String(values[w.id] ?? '').split(',');
			if (!start || !end) return { kind: 'required', widget: w };
			if (parseFloat(start) >= parseFloat(end)) return { kind: 'timestamp_order', widget: w };
		} else if (!String(values[w.id] ?? '').trim()) {
			return { kind: 'required', widget: w };
		}
	}
	return null;
}

/** Assemble the `response_data` JSONB payload for a normal save. Hidden
 *  widgets become null. Audio widgets pull from `audioPaths` (server-returned
 *  storage paths). timestamp-range collapses "start,end" → "start-end".
 *  Adds `_chunk` sentinel when on a chunked route. */
export function buildResponseData<W extends WidgetLike>(
	widgets: W[],
	values: Record<string, unknown>,
	audioPaths: Record<string, string>,
	isVisible: (w: W) => boolean,
	chunkSlug: string | null
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const w of widgets) {
		if (!isVisible(w)) {
			out[w.id] = null;
			continue;
		}
		if (w.type === 'audio-recording') {
			out[w.id] = audioPaths[w.id] ?? null;
		} else if (w.type === 'timestamp-range') {
			const [start, end] = String(values[w.id] ?? '').split(',');
			out[w.id] = start && end ? `${start}-${end}` : null;
		} else {
			const v = values[w.id];
			out[w.id] = v != null && v !== '' ? String(v) : null;
		}
	}
	if (chunkSlug) out._chunk = chunkSlug;
	return out;
}

/** Assemble a "skip" response_data payload for the gatekeeper "No" path:
 *  every widget answer is JSON null. Sentinels (`_chunk`) preserved. */
export function buildSkipResponseData<W extends WidgetLike>(
	widgets: W[],
	chunkSlug: string | null
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const w of widgets) out[w.id] = null;
	if (chunkSlug) out._chunk = chunkSlug;
	return out;
}

type SavePayload = {
	phaseId: string;
	stimulusId: string;
	responseData: Record<string, unknown>;
	responseIndex: number;
};

/** Upload every audio blob to /upload, returning a widgetId → storage path
 *  map. Throws if any upload fails — the caller MUST catch before calling
 *  `persistResponse` to keep the (upload, save) sequence transactional. */
export async function uploadAudioBlobs(
	blobs: Record<string, Blob>,
	slug: string,
	phaseSlug: string,
	stimulusId: string
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const [widgetId, blob] of Object.entries(blobs)) {
		const formData = new FormData();
		formData.append('file', blob);
		formData.append('widgetId', widgetId);
		formData.append('stimulusId', stimulusId);
		const res = await fetch(`/e/${slug}/${phaseSlug}/upload`, { method: 'POST', body: formData });
		if (!res.ok) throw new Error('Failed to upload audio');
		const { path } = await res.json();
		out[widgetId] = path;
	}
	return out;
}

/** POST a fully-assembled payload to the phase save endpoint. Returns the
 *  saved row so the caller can append to its in-memory response list. */
export async function persistResponse(
	slug: string,
	phaseSlug: string,
	payload: SavePayload
): Promise<ResponseRecord> {
	const res = await fetch(`/e/${slug}/${phaseSlug}/save`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!res.ok) throw new Error('Failed to save');
	return await res.json();
}
