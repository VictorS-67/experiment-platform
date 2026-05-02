<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';

	type Props = {
		widget: ResponseWidgetType;
		value: string;
	};

	let { widget, value = $bindable('') }: Props = $props();

	const min = $derived(widget.config?.min ?? 1);
	const max = $derived(widget.config?.max ?? 7);
</script>

<div class="flex items-center gap-2 mt-1">
	{#if widget.config?.minLabel}
		<span class="text-xs text-gray-500">{i18n.localized(widget.config.minLabel)}</span>
	{/if}
	<div class="flex gap-1">
		{#each Array.from({ length: max - min + 1 }, (_, i) => min + i) as n}
			<button
				type="button"
				class="w-9 h-9 rounded border text-sm cursor-pointer transition-colors {value === String(n) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 hover:border-indigo-400'}"
				onclick={() => { value = String(n); }}
			>
				{n}
			</button>
		{/each}
	</div>
	{#if widget.config?.maxLabel}
		<span class="text-xs text-gray-500">{i18n.localized(widget.config.maxLabel)}</span>
	{/if}
</div>
