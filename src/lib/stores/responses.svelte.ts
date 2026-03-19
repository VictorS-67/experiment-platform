import type { ResponseRecord } from '$lib/services/data';

class ResponseStore {
	list = $state<ResponseRecord[]>([]);
	currentIndex = $state(0);
	currentPhaseId = $state('');

	reset() {
		this.list = [];
		this.currentIndex = 0;
		this.currentPhaseId = '';
	}

	get completedStimuli(): Map<string, 'completed' | 'skipped'> {
		const completed = new Map<string, 'completed' | 'skipped'>();
		for (const r of this.list) {
			// Check all widget values (excluding _timestamp metadata) to determine status
			const widgetEntries = Object.entries(r.response_data).filter(([k]) => k !== '_timestamp');
			const allNull = widgetEntries.length > 0 &&
				widgetEntries.every(([, v]) => v === null || v === 'null');

			if (allNull) {
				if (!completed.has(r.stimulus_id)) {
					completed.set(r.stimulus_id, 'skipped');
				}
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
