<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';

	type Props = {
		widget: ResponseWidgetType;
		value: string;
	};

	let { widget, value = $bindable('') }: Props = $props();
</script>

<input
	id={`widget-input-${widget.id}`}
	type="number"
	class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
	bind:value
	min={widget.config?.min}
	max={widget.config?.max}
	step={widget.config?.step ?? 1}
/>
