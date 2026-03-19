<script lang="ts">
	import type { StimulusItemType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		items = [],
		activeId = '',
		completionMap = new Map<string, 'completed' | 'skipped'>(),
		onselect
	}: {
		items: StimulusItemType[];
		activeId: string;
		completionMap: Map<string, 'completed' | 'skipped'>;
		onselect: (item: StimulusItemType) => void;
	} = $props();
</script>

<div class="flex flex-wrap gap-2 py-3" id="stimulus-nav">
	{#each items as item (item.id)}
		{@const state = completionMap.get(item.id)}
		<button
			class="stimulus-button"
			class:active={item.id === activeId}
			class:completed={state === 'completed' && item.id !== activeId}
			class:skipped={state === 'skipped' && item.id !== activeId}
			onclick={() => onselect(item)}
		>
			{i18n.localized(item.label, item.id)}
		</button>
	{/each}
</div>
