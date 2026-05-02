<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';

	type Props = {
		widget: ResponseWidgetType;
		value: string;
	};

	let { widget, value = $bindable('') }: Props = $props();
</script>

<select
	id={`widget-input-${widget.id}`}
	class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
	bind:value
>
	<option value="">---</option>
	{#each widget.config?.options ?? [] as option}
		<option value={option.value}>{i18n.localized(option.label, option.value)}</option>
	{/each}
</select>
