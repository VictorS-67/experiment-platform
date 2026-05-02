<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';
	import TextWidget from './types/TextWidget.svelte';
	import TextareaWidget from './types/TextareaWidget.svelte';
	import SelectWidget from './types/SelectWidget.svelte';
	import NumberWidget from './types/NumberWidget.svelte';
	import LikertWidget from './types/LikertWidget.svelte';
	import TimestampRangeWidget from './types/TimestampRangeWidget.svelte';
	import SliderWidget from './types/SliderWidget.svelte';
	import MultiselectWidget from './types/MultiselectWidget.svelte';
	import AudioRecordingWidget from './types/AudioRecordingWidget.svelte';

	let {
		widget,
		value = $bindable(''),
		mediaElement = null,
		onAudioReady = null,
		onReplayRequest = null
	}: {
		widget: ResponseWidgetType;
		value: string;
		mediaElement?: HTMLMediaElement | null;
		onAudioReady?: ((widgetId: string, blob: Blob | null) => void) | null;
		onReplayRequest?: ((start: number, end: number, mode: 'segment' | 'full-highlight') => void) | null;
	} = $props();

	let label = $derived(i18n.localized(widget.label, widget.id));

	// Dispatch map: widget.type → per-type component. Adding a new widget type
	// is a new file under `./types/` plus one entry here. The label header
	// stays in this parent since every type-component would otherwise duplicate
	// the `widget.stepLabel` vs `widget.label` + optional indicator logic.
	//
	// Each type component accepts the same shared prop interface (widget +
	// bindable value + optional callbacks). Unused callbacks are ignored by
	// the widget that doesn't need them, but the dispatch must be uniform so
	// TypeScript can validate the spread.
	const TYPES = {
		text: TextWidget,
		textarea: TextareaWidget,
		select: SelectWidget,
		number: NumberWidget,
		likert: LikertWidget,
		'timestamp-range': TimestampRangeWidget,
		slider: SliderWidget,
		multiselect: MultiselectWidget,
		'audio-recording': AudioRecordingWidget
	} as const;

	const Component = $derived(TYPES[widget.type as keyof typeof TYPES]);
</script>

<div class="mb-4" id={`widget-${widget.id}`}>
	{#if widget.stepLabel}
		<p class="text-sm font-medium text-gray-700 mb-1.5">{i18n.localized(widget.stepLabel)}</p>
	{:else}
		<label class="block text-sm font-medium text-gray-700 mb-1" for={`widget-input-${widget.id}`}>
			{label}
			{#if !widget.required}
				<span class="text-gray-400 text-xs">({i18n.platform('common.optional')})</span>
			{/if}
		</label>
	{/if}

	{#if Component}
		<Component {widget} bind:value {mediaElement} {onAudioReady} {onReplayRequest} />
	{:else}
		<p class="text-sm text-gray-400">Widget type "{widget.type}" not yet implemented.</p>
	{/if}
</div>
