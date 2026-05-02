<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';

	type Props = {
		widget: ResponseWidgetType;
		value: string;
	};

	let { widget, value = $bindable('') }: Props = $props();

	const min = $derived(widget.config?.min ?? 0);
	const max = $derived(widget.config?.max ?? 100);
	const step = $derived(widget.config?.step ?? 1);
</script>

<div class="mt-1">
	<div class="flex items-center gap-3">
		{#if widget.config?.minLabel}
			<span class="text-xs text-gray-500 shrink-0">{i18n.localized(widget.config.minLabel)}</span>
		{/if}
		<input
			id={`widget-input-${widget.id}`}
			type="range"
			class="flex-1 accent-indigo-600"
			bind:value
			{min}
			{max}
			{step}
		/>
		{#if widget.config?.maxLabel}
			<span class="text-xs text-gray-500 shrink-0">{i18n.localized(widget.config.maxLabel)}</span>
		{/if}
	</div>
	<p class="text-center text-sm font-medium text-indigo-600 mt-1">{value}</p>
</div>
