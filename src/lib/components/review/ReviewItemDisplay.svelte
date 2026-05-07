<script lang="ts">
	import type { ResponseRecord } from '$lib/services/data';
	import type { StimuliConfigType, StimulusItemType } from '$lib/config/schema';
	import StimulusRenderer from '$lib/components/stimuli/StimulusRenderer.svelte';
	import { createReplayController } from '$lib/utils/replay';
	import { formatTimestamp } from '$lib/utils/time-format';
	import { widgetEntries, isAudioPath } from '$lib/utils/response-data';
	import { i18n } from '$lib/i18n/index.svelte';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';

	let {
		sourceResponse,
		stimuliConfig,
		stimulusItem,
		stimulusSrc = undefined,
		signedUrls = undefined,
		replayMode = 'segment',
		mediaElement = $bindable(undefined)
	}: {
		sourceResponse: ResponseRecord;
		stimuliConfig: StimuliConfigType;
		stimulusItem: StimulusItemType | undefined;
		stimulusSrc?: string;
		signedUrls?: Record<string, string>;
		replayMode?: 'segment' | 'full-highlight';
		mediaElement?: HTMLMediaElement | undefined;
	} = $props();

	let highlightActive = $state(false);
	const controller = createReplayController();

	// Parse response data into timestamps, audio recordings, and regular key-values
	let parsed = $derived.by(() => {
		const data = sourceResponse.response_data;
		const timestamps: { widgetId: string; start: number; end: number }[] = [];
		const audios: { key: string; path: string }[] = [];
		const regular: { key: string; val: unknown }[] = [];

		for (const [key, val] of widgetEntries(data)) {
			if (val === null || val === 'null') continue;
			if (typeof val === 'string' && /^\d+(\.\d+)?-\d+(\.\d+)?$/.test(val)) {
				const [s, e] = val.split('-');
				timestamps.push({ widgetId: key, start: parseFloat(s), end: parseFloat(e) });
			} else if (isAudioPath(val)) {
				audios.push({ key, path: val });
			} else {
				regular.push({ key, val });
			}
		}
		return { timestamps, audios, regular };
	});

	// Reuses the unified timestamp formatter (`m:ss.cs`). Local helper kept for
	// call-site clarity; delegates to the shared util.
	const formatTime = formatTimestamp;

	function handleReplay(start: number, end: number) {
		if (!mediaElement) return;
		if (replayMode === 'full-highlight') {
			controller.replayFullWithHighlight(mediaElement, start, end, (active) => {
				highlightActive = active;
			});
		} else {
			controller.replaySegment(mediaElement, start, end);
		}
	}
</script>

{#if stimulusItem}
	<!-- Same `.stimulus-highlight` class as the phase page, defined in
	     app.css. Single source of truth for the yellow segment-replay ring. -->
	<div class="rounded-lg" class:stimulus-highlight={highlightActive}>
		<StimulusRenderer
			item={stimulusItem}
			config={stimuliConfig}
			src={stimulusSrc}
			markers={parsed.timestamps.flatMap((t) => [
				{ at: t.start, label: 'start' },
				{ at: t.end, label: 'end' }
			])}
			bind:mediaElement
		/>
	</div>
{/if}

<div class="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
	<p class="text-sm font-medium text-blue-800 mb-2">{i18n.platform('review.source_response')}</p>
	{#each parsed.regular as { key, val }}
		<div class="text-sm text-blue-700 mb-1">
			<strong>{key}:</strong> {val}
		</div>
	{/each}
	{#each parsed.audios as { key, path }}
		<div class="text-sm text-blue-700 mb-1">
			<strong>{key}:</strong>
			<audio src={signedUrls?.[path] ?? `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/experiments/${path}`} controls class="inline h-8 w-48 align-middle ml-1"></audio>
		</div>
	{/each}
	{#each parsed.timestamps as { widgetId, start, end }}
		<div class="text-sm text-blue-700 mb-2 flex items-center gap-3 flex-wrap">
			<span><strong>{widgetId}:</strong> <span class="font-mono">{formatTime(start)} → {formatTime(end)}</span></span>
			{#if mediaElement}
				<button
					type="button"
					onclick={() => handleReplay(start, end)}
					class="px-2 py-0.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer"
				>
					{i18n.platform('review.replay')}
				</button>
			{/if}
		</div>
	{/each}
</div>
