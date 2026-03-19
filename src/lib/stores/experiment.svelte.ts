import type { ExperimentConfig } from '$lib/config/schema';

class ExperimentStore {
	config = $state<ExperimentConfig | null>(null);
	id = $state<string | null>(null);

	get phases() { return this.config?.phases ?? []; }
	get stimuli() { return this.config?.stimuli ?? null; }
	get stimuliItems() { return this.config?.stimuli?.items ?? []; }
	get registrationFields() { return this.config?.registration?.fields ?? []; }
	get supportedLanguages() { return this.config?.metadata?.languages ?? ['en']; }
}

export const experiment = new ExperimentStore();
