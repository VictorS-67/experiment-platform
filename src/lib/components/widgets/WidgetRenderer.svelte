<script lang="ts">
	import type { ResponseWidgetType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';
	import AudioRecorder from './AudioRecorder.svelte';

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
	let placeholder = $derived(widget.placeholder ? i18n.localized(widget.placeholder) : '');
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

	{#if widget.type === 'text'}
		<input
			id={`widget-input-${widget.id}`}
			type="text"
			class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
			placeholder={placeholder || label}
			bind:value
		/>
	{:else if widget.type === 'textarea'}
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
	{:else if widget.type === 'select'}
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
	{:else if widget.type === 'number'}
		<input
			id={`widget-input-${widget.id}`}
			type="number"
			class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
			bind:value
			min={widget.config?.min}
			max={widget.config?.max}
			step={widget.config?.step ?? 1}
		/>
	{:else if widget.type === 'likert'}
		{@const min = widget.config?.min ?? 1}
		{@const max = widget.config?.max ?? 7}
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
	{:else if widget.type === 'timestamp-range'}
		{@const startLabel = widget.config?.captureStartLabel ? i18n.localized(widget.config.captureStartLabel) : i18n.platform('timestamps.start')}
		{@const endLabel = widget.config?.captureEndLabel ? i18n.localized(widget.config.captureEndLabel) : i18n.platform('timestamps.end')}
		{@const parts = value.split(',') }
		{@const startTime = parts[0] || i18n.platform('timestamps.not_set')}
		{@const endTime = parts[1] || i18n.platform('timestamps.not_set')}
		{@const tsStart = parseFloat(parts[0])}
		{@const tsEnd = parseFloat(parts[1])}
		{@const orderError = !isNaN(tsStart) && !isNaN(tsEnd) && tsStart >= tsEnd}
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
			{@const s = parseFloat(parts[0])}
			{@const e = parseFloat(parts[1])}
			{@const hasRange = !isNaN(s) && !isNaN(e)}
			<div class="mt-2 text-center">
				<button
					type="button"
					disabled={!hasRange}
					onclick={() => { if (hasRange) onReplayRequest(s, e, widget.config!.timestampReviewMode!); }}
					class="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{i18n.platform('timestamps.review')}
				</button>
			</div>
		{/if}
	{:else if widget.type === 'slider'}
		{@const min = widget.config?.min ?? 0}
		{@const max = widget.config?.max ?? 100}
		{@const step = widget.config?.step ?? 1}
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
	{:else if widget.type === 'multiselect'}
		{@const selected = value ? value.split(',').filter(Boolean) : []}
		<div class="flex flex-wrap gap-2 mt-1">
			{#each widget.config?.options ?? [] as option}
				{@const isSelected = selected.includes(option.value)}
				<button
					type="button"
					class="px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors {isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 hover:border-indigo-400'}"
					onclick={() => {
						if (isSelected) {
							value = selected.filter(v => v !== option.value).join(',');
						} else {
							value = [...selected, option.value].join(',');
						}
					}}
				>
					{i18n.localized(option.label, option.value)}
				</button>
			{/each}
		</div>
	{:else if widget.type === 'audio-recording'}
		<AudioRecorder
			widgetId={widget.id}
			bind:value
			maxDurationSeconds={widget.config?.maxDurationSeconds ?? 120}
			onAudioReady={onAudioReady ?? undefined}
		/>
	{:else}
		<p class="text-sm text-gray-400">Widget type "{widget.type}" not yet implemented.</p>
	{/if}
</div>
