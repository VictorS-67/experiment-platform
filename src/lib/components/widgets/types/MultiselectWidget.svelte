<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';

	type Props = {
		widget: ResponseWidgetType;
		value: string;
	};

	let { widget, value = $bindable('') }: Props = $props();

	const selected = $derived(value ? value.split(',').filter(Boolean) : []);
</script>

<div class="flex flex-wrap gap-2 mt-1">
	{#each widget.config?.options ?? [] as option}
		{@const isSelected = selected.includes(option.value)}
		<button
			type="button"
			class="px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors {isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 hover:border-indigo-400'}"
			onclick={() => {
				if (isSelected) {
					value = selected.filter((v) => v !== option.value).join(',');
				} else {
					value = [...selected, option.value].join(',');
				}
			}}
		>
			{i18n.localized(option.label, option.value)}
		</button>
	{/each}
</div>
