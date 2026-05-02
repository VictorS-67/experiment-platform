import type { ResponseRecord } from '$lib/services/data';
import { isAllNullResponse } from '$lib/utils/response-data';

class ResponseStore {
	list = $state<ResponseRecord[]>([]);
	currentIndex = $state(0);
	currentPhaseId = $state('');

	reset() {
		this.list = [];
		this.currentIndex = 0;
		this.currentPhaseId = '';
	}

	/**
	 * GLOBAL "ever responded to" map — keyed by `stimulus_id` regardless of
	 * which chunk a response was made in. Useful for callers that legitimately
	 * want global state (e.g. skip-rule evaluation, revisit-prevention guards).
	 *
	 * For chunk-aware completion (StimulusNav button colors, progress bars,
	 * gatekeeper logic on stimuli that recur across chunks like anchors),
	 * derive a `chunkCompletion` Map at the page level instead — see the
	 * phase page for the canonical pattern.
	 */
	get completedStimuli(): Map<string, 'completed' | 'skipped'> {
		const completed = new Map<string, 'completed' | 'skipped'>();
		for (const r of this.list) {
			if (isAllNullResponse(r.response_data)) {
				if (!completed.has(r.stimulus_id)) completed.set(r.stimulus_id, 'skipped');
			} else {
				completed.set(r.stimulus_id, 'completed');
			}
		}
		return completed;
	}

	get byStimulus(): Map<string, ResponseRecord[]> {
		const map = new Map<string, ResponseRecord[]>();
		for (const r of this.list) {
			const existing = map.get(r.stimulus_id) ?? [];
			existing.push(r);
			map.set(r.stimulus_id, existing);
		}
		return map;
	}
}

export const responseStore = new ResponseStore();
