<script lang="ts">
	import type { ExperimentConfig } from '$lib/config/schema';
	import MetadataSection from './config/MetadataSection.svelte';
	import RegistrationSection from './config/RegistrationSection.svelte';
	import PhasesSection from './config/PhasesSection.svelte';
	import StimuliSection from './config/StimuliSection.svelte';
	import ChunkingSection from './config/ChunkingSection.svelte';
	import TutorialSection from './config/TutorialSection.svelte';
	import CompletionSection from './config/CompletionSection.svelte';

	let {
		config,
		experimentId,
		activeSection = 'metadata'
	}: {
		config: ExperimentConfig;
		experimentId?: string;
		activeSection?: string;
	} = $props();

	let languages = $derived(config.metadata?.languages ?? ['en']);
</script>

<div class="space-y-4">
	{#if activeSection === 'metadata'}
		<MetadataSection {config} {languages} />
	{:else if activeSection === 'registration'}
		<RegistrationSection {config} {languages} />
	{:else if activeSection === 'phases'}
		<PhasesSection {config} {languages} />
	{:else if activeSection === 'stimuli'}
		<StimuliSection {config} {languages} {experimentId} />
	{:else if activeSection === 'chunking'}
		<ChunkingSection {config} {languages} />
	{:else if activeSection === 'tutorial'}
		<TutorialSection {config} {languages} />
	{:else if activeSection === 'completion'}
		<CompletionSection {config} {languages} />
	{/if}
</div>
