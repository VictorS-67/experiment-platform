<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';

	type Props = {
		widget: ResponseWidgetType;
		value: string;
	};

	let { widget, value = $bindable('') }: Props = $props();

	const label = $derived(i18n.localized(widget.label, widget.id));
	const placeholder = $derived(widget.placeholder ? i18n.localized(widget.placeholder) : '');
</script>

<textarea
	id={`widget-input-${widget.id}`}
	class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
	placeholder={placeholder || label}
	bind:value
	rows="3"
></textarea>
{#if widget.config?.showCharCount}
	<p class="text-xs text-gray-400 mt-1">{value.length} characters</p>
{/if}
