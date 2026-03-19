<script lang="ts">
	import type { ResponseRecord } from '$lib/services/data';
	import type { StimuliConfigType, StimulusItemType } from '$lib/config/schema';
	import StimulusRenderer from '$lib/components/stimuli/StimulusRenderer.svelte';
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		sourceResponse,
		stimuliConfig,
		stimulusItem,
		mediaElement = $bindable(undefined)
	}: {
		sourceResponse: ResponseRecord;
		stimuliConfig: StimuliConfigType;
		stimulusItem: StimulusItemType | undefined;
		mediaElement?: HTMLMediaElement | undefined;
	} = $props();

	let parsed = $derived.by(() => {
		const data = sourceResponse.response_data;
		const pairedKeys = new Set<string>();
		const timestamps: { widgetId: string; start: number; end: number }[] = [];
		for (const [key, val] of Object.entries(data)) {
			if (key.endsWith('_start') && val !== null && val !== 'null') {
				const widgetId = key.slice(0, -6);
				const endVal = data[`${widgetId}_end`];
				if (endVal !== null && endVal !== 'null' && endVal !== undefined) {
					timestamps.push({ widgetId, start: parseFloat(val as string), end: parseFloat(endVal as string) });
					pairedKeys.add(key);
					pairedKeys.add(`${widgetId}_end`);
				}
			}
		}
		const regular: { key: string; val: unknown }[] = [];
		for (const [key, val] of Object.entries(data)) {
			if (key === '_timestamp' || val === null || val === 'null') continue;
			if (!pairedKeys.has(key)) regular.push({ key, val });
		}
		return { timestamps, regular };
	});

	function formatTime(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = (secs % 60).toFixed(2).padStart(5, '0');
		return `${m}:${s}`;
	}

	function replaySegment(start: number, end: number) {
		if (!mediaElement) return;
		mediaElement.currentTime = start;
		mediaElement.play();
		function onTimeUpdate() {
			if (mediaElement && mediaElement.currentTime >= end) {
				mediaElement.pause();
				mediaElement.removeEventListener('timeupdate', onTimeUpdate);
			}
		}
		mediaElement.addEventListener('timeupdate', onTimeUpdate);
	}
</script>

{#if stimulusItem}
	<StimulusRenderer item={stimulusItem} config={stimuliConfig} bind:mediaElement />
{/if}

<div class="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
	<p class="text-sm font-medium text-blue-800 mb-2">{i18n.platform('review.source_response')}</p>
	{#each parsed.regular as { key, val }}
		<div class="text-sm text-blue-700 mb-1">
			<strong>{key}:</strong> {val}
		</div>
	{/each}
	{#each parsed.timestamps as { widgetId, start, end }}
		<div class="text-sm text-blue-700 mb-2 flex items-center gap-3 flex-wrap">
			<span><strong>{widgetId}:</strong> <span class="font-mono">{formatTime(start)} → {formatTime(end)}</span></span>
			{#if mediaElement}
				<button
					type="button"
					onclick={() => replaySegment(start, end)}
					class="px-2 py-0.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer"
				>
					▶ {i18n.platform('review.replay')}
				</button>
			{/if}
		</div>
	{/each}
</div>
