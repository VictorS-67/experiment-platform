import type { ExperimentConfig } from '$lib/config/schema';

/** Deep-set a value on a config object by path. Creates intermediate objects as needed. */
export function updatePath(config: ExperimentConfig, path: string[], value: unknown) {
	let target: Record<string, unknown> = config as Record<string, unknown>;
	for (let i = 0; i < path.length - 1; i++) {
		if (target[path[i]] == null) target[path[i]] = {};
		target = target[path[i]] as Record<string, unknown>;
	}
	target[path[path.length - 1]] = value;
}

export const fieldTypes = ['text', 'number', 'email', 'select', 'multiselect', 'textarea'] as const;
export const widgetTypes = ['text', 'textarea', 'select', 'multiselect', 'likert', 'timestamp-range', 'audio-recording', 'slider', 'number'] as const;
export const feedbackWidgetTypes = ['text', 'textarea', 'select', 'multiselect', 'likert', 'slider', 'number'] as const;
export const stimulusTypes = ['video', 'image', 'audio', 'text', 'mixed'] as const;
export const sourceTypes = ['upload', 'external-urls', 'supabase-storage'] as const;
export const phaseTypes = ['stimulus-response', 'review'] as const;
export const orderTypes = ['sequential', 'random', 'random-per-participant'] as const;
