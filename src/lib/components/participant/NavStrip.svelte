<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import StimulusNav from '$lib/components/layout/StimulusNav.svelte';
	import type { StimulusItemType } from '$lib/config/schema';

	type Props = {
		// Pre-formatted middle counter — caller resolves between
		// "Item 12 of 32" (block-aware, stim-resp) and "3 / 8" (raw, review)
		// so the component stays free of `{#if isReviewPhase}` branches.
		label: string;
		canPrev: boolean;
		canNext: boolean;
		onPrev: () => void;
		onNext: () => void;
		expanded: boolean;
		onToggle: () => void;
		// StimulusNav props (rendered only when expanded)
		items: StimulusItemType[];
		activeId: string;
		completionMap: Map<string, 'completed' | 'skipped'>;
		onSelectItem: (item: StimulusItemType) => void;
	};

	let { label, canPrev, canNext, onPrev, onNext, expanded, onToggle, items, activeId, completionMap, onSelectItem }: Props = $props();
</script>

<div class="mt-4 flex items-center justify-between text-sm">
	<button
		type="button"
		onclick={onPrev}
		disabled={!canPrev}
		class="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
	>
		← {i18n.platform('common.previous')}
	</button>
	<button
		type="button"
		onclick={onToggle}
		class="text-gray-500 hover:text-gray-700 cursor-pointer underline-offset-2 hover:underline"
	>
		{label} · {expanded ? i18n.platform('survey.hide_nav') : i18n.platform('survey.jump_to')}
	</button>
	<button
		type="button"
		onclick={onNext}
		disabled={!canNext}
		class="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
	>
		{i18n.platform('common.next')} →
	</button>
</div>
{#if expanded}
	<StimulusNav {items} {activeId} {completionMap} onselect={onSelectItem} />
{/if}
