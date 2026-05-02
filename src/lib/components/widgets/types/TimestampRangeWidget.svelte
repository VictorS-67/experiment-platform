<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';
	import { formatTimestamp } from '$lib/utils/time-format';

	type Props = {
		widget: ResponseWidgetType;
		value: string;
		mediaElement?: HTMLMediaElement | null;
		onReplayRequest?: ((s: number, e: number, m: 'segment' | 'full-highlight') => void) | null;
	};

	let { widget, value = $bindable(''), mediaElement = null, onReplayRequest = null }: Props = $props();

	function fmt(v: string): string {
		const n = parseFloat(v);
		return Number.isFinite(n) && n >= 0 ? formatTimestamp(n) : v;
	}

	const startLabel = $derived(widget.config?.captureStartLabel ? i18n.localized(widget.config.captureStartLabel) : i18n.platform('timestamps.start'));
	const endLabel = $derived(widget.config?.captureEndLabel ? i18n.localized(widget.config.captureEndLabel) : i18n.platform('timestamps.end'));
	const parts = $derived(value.split(','));
	const startTime = $derived(parts[0] ? fmt(parts[0]) : i18n.platform('timestamps.not_set'));
	const endTime = $derived(parts[1] ? fmt(parts[1]) : i18n.platform('timestamps.not_set'));
	const tsStart = $derived(parseFloat(parts[0]));
	const tsEnd = $derived(parseFloat(parts[1]));
	const orderError = $derived(!isNaN(tsStart) && !isNaN(tsEnd) && tsStart >= tsEnd);
	const hasRange = $derived(!isNaN(tsStart) && !isNaN(tsEnd));
</script>

<div class="flex gap-4 items-center">
	<div class="flex-1">
		<button
			type="button"
			id="start-time-btn"
			class="w-full text-sm bg-gray-100 border border-gray-300 rounded px-3 py-2 hover:bg-gray-200 cursor-pointer transition-colors"
			onclick={() => {
				if (mediaElement) {
					const t = mediaElement.currentTime.toFixed(2);
					const et = value.split(',')[1] || '';
					value = `${t},${et}`;
				}
			}}
		>
			{startLabel}
		</button>
		<p class="text-xs text-gray-500 mt-1 text-center">{startTime}</p>
	</div>
	<div class="flex-1">
		<button
			type="button"
			id="end-time-btn"
			class="w-full text-sm bg-gray-100 border border-gray-300 rounded px-3 py-2 hover:bg-gray-200 cursor-pointer transition-colors"
			onclick={() => {
				if (mediaElement) {
					const t = mediaElement.currentTime.toFixed(2);
					const st = value.split(',')[0] || '';
					value = `${st},${t}`;
				}
			}}
		>
			{endLabel}
		</button>
		<p class="text-xs text-gray-500 mt-1 text-center">{endTime}</p>
	</div>
</div>
{#if orderError}
	<p class="text-xs text-red-600 mt-1">{i18n.platform('timestamps.order_error')}</p>
{/if}
{#if widget.config?.timestampReviewMode && onReplayRequest}
	<div class="mt-2 text-center">
		<button
			type="button"
			disabled={!hasRange}
			onclick={() => { if (hasRange) onReplayRequest(tsStart, tsEnd, widget.config!.timestampReviewMode!); }}
			class="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{i18n.platform('timestamps.review')}
		</button>
	</div>
{/if}
