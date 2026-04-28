<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import Field from './Field.svelte';
	import { updatePath, feedbackWidgetTypes } from './helpers';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages }: { config: ExperimentConfig; languages: string[] } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);

	function addFeedbackWidget() {
		if (!config.completion) return;
		if (!config.completion.feedbackWidgets) config.completion.feedbackWidgets = [];
		config.completion.feedbackWidgets.push({
			id: `fb_${Date.now()}`,
			type: 'text' as const,
			label: Object.fromEntries(languages.map((l) => [l, ''])),
			required: false
		});
	}

	function removeFeedbackWidget(wi: number) {
		config.completion?.feedbackWidgets?.splice(wi, 1);
	}

	function fbPath(wi: number, field: string): string[] {
		return ['completion', 'feedbackWidgets', String(wi), field];
	}

	function addFeedbackWidgetOption(wi: number) {
		const widget = config.completion?.feedbackWidgets?.[wi];
		if (!widget) return;
		if (!widget.config) widget.config = {};
		if (!widget.config.options) widget.config.options = [];
		widget.config.options.push({
			value: `option_${Date.now()}`,
			label: Object.fromEntries(languages.map((l) => [l, '']))
		});
	}

	function removeFeedbackWidgetOption(wi: number, oi: number) {
		config.completion?.feedbackWidgets?.[wi]?.config?.options?.splice(oi, 1);
	}
</script>

<div class="space-y-4">
	{#if config.completion}
		<LocalizedInput label="Title" value={config.completion.title} {languages} onchange={(v) => update(['completion', 'title'], v)} />
		<LocalizedInput label="Body" value={config.completion.body} {languages} multiline onchange={(v) => update(['completion', 'body'], v)} />
		<Field label="Redirect URL (optional)">
			<input
				type="text"
				value={config.completion.redirectUrl ?? ''}
				oninput={(e) => update(['completion', 'redirectUrl'], e.currentTarget.value || undefined)}
				class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
				placeholder="https://example.com/thank-you"
			/>
		</Field>
		<label class="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				checked={config.completion.showSummary ?? false}
				onchange={(e) => update(['completion', 'showSummary'], e.currentTarget.checked)}
			/>
			Show response summary to participant on completion
		</label>

		<!-- Feedback Widgets -->
		<div class="border-t border-gray-200 pt-4 mt-4">
			<div class="flex items-center justify-between mb-2">
				<h4 class="text-sm font-medium text-gray-700">Feedback Widgets ({config.completion.feedbackWidgets?.length ?? 0})</h4>
				<button type="button" onclick={addFeedbackWidget} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
			</div>
			<p class="text-xs text-gray-400 mb-3">Optional widgets shown on the completion page for participants to provide feedback.</p>

			{#each config.completion.feedbackWidgets ?? [] as widget, wi}
				<div class="border border-gray-200 rounded p-3 mb-2 space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-mono text-gray-400">{widget.id}</span>
						<button type="button" onclick={() => removeFeedbackWidget(wi)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
					</div>
					<div class="grid grid-cols-3 gap-2">
						<Field label="ID">
							<input type="text" value={widget.id}
								oninput={(e) => update(fbPath(wi, 'id'), e.currentTarget.value)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
						</Field>
						<Field label="Type">
							<select value={widget.type}
								onchange={(e) => update(fbPath(wi, 'type'), e.currentTarget.value)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
								{#each feedbackWidgetTypes as t}
									<option value={t}>{t}</option>
								{/each}
							</select>
						</Field>
						<label class="flex items-end gap-2 text-xs">
							<input type="checkbox" checked={widget.required}
								onchange={(e) => update(fbPath(wi, 'required'), e.currentTarget.checked)} />
							Required
						</label>
					</div>
					<LocalizedInput label="Label" value={widget.label} {languages} onchange={(v) => update(fbPath(wi, 'label'), v)} />
					{#if ['text', 'textarea', 'number'].includes(widget.type)}
						<LocalizedInput label="Placeholder" value={widget.placeholder ?? {}} {languages} onchange={(v) => update(fbPath(wi, 'placeholder'), Object.values(v).some(Boolean) ? v : undefined)} />
					{/if}

					<!-- Options for select/multiselect -->
					{#if widget.type === 'select' || widget.type === 'multiselect'}
						<div class="border-t border-gray-100 pt-2 mt-2">
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs text-gray-500">Options ({widget.config?.options?.length ?? 0})</span>
								<button type="button" onclick={() => addFeedbackWidgetOption(wi)} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
							</div>
							{#each widget.config?.options ?? [] as option, oi}
								{@const optPath = [...fbPath(wi, 'config'), 'options', String(oi)]}
								<div class="flex items-start gap-2 mb-1">
									<input type="text" value={option.value}
										oninput={(e) => update([...optPath, 'value'], e.currentTarget.value)}
										aria-label="Option value"
										class="w-24 shrink-0 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="value" />
									<div class="flex-1">
										<LocalizedInput label="" value={option.label} {languages} onchange={(v) => update([...optPath, 'label'], v)} />
									</div>
									<button type="button" onclick={() => removeFeedbackWidgetOption(wi, oi)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer mt-1">x</button>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Slider / Likert -->
					{#if widget.type === 'slider' || widget.type === 'likert'}
						<div class="border-t border-gray-100 pt-2 mt-2">
							<span class="text-xs text-gray-500 block mb-1">Range config</span>
							<div class="grid grid-cols-3 gap-2">
								<Field label="Min">
									<input type="number" value={widget.config?.min ?? (widget.type === 'likert' ? 1 : 0)}
										oninput={(e) => update([...fbPath(wi, 'config'), 'min'], e.currentTarget.valueAsNumber)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
								</Field>
								<Field label="Max">
									<input type="number" value={widget.config?.max ?? (widget.type === 'likert' ? 7 : 100)}
										oninput={(e) => update([...fbPath(wi, 'config'), 'max'], e.currentTarget.valueAsNumber)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
								</Field>
								{#if widget.type === 'slider'}
									<Field label="Step">
										<input type="number" value={widget.config?.step ?? 1}
											oninput={(e) => update([...fbPath(wi, 'config'), 'step'], e.currentTarget.valueAsNumber)}
											class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
									</Field>
								{/if}
							</div>
							<div class="grid grid-cols-2 gap-2 mt-2">
								<LocalizedInput label="Min label" value={widget.config?.minLabel ?? {}} {languages} onchange={(v) => update([...fbPath(wi, 'config'), 'minLabel'], v)} />
								<LocalizedInput label="Max label" value={widget.config?.maxLabel ?? {}} {languages} onchange={(v) => update([...fbPath(wi, 'config'), 'maxLabel'], v)} />
							</div>
						</div>
					{/if}

					<!-- Textarea config -->
					{#if widget.type === 'textarea'}
						<div class="border-t border-gray-100 pt-2 mt-2 space-y-2">
							<span class="text-xs text-gray-500 block">Textarea config</span>
							<label class="flex items-center gap-2 text-xs">
								<input type="checkbox" checked={widget.config?.showCharCount ?? false}
									onchange={(e) => update([...fbPath(wi, 'config'), 'showCharCount'], e.currentTarget.checked)} />
								Show character count
							</label>
							<div class="grid grid-cols-2 gap-2">
								<Field label="Min length">
									<input type="number" value={widget.config?.minLength ?? ''}
										oninput={(e) => update([...fbPath(wi, 'config'), 'minLength'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
								</Field>
								<Field label="Max length">
									<input type="number" value={widget.config?.maxLength ?? ''}
										oninput={(e) => update([...fbPath(wi, 'config'), 'maxLength'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
								</Field>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-sm text-gray-500">No completion config. Add one:</p>
		<button
			type="button"
			onclick={() => {
				config.completion = {
					title: Object.fromEntries(languages.map((l) => [l, 'Thank you!'])),
					body: Object.fromEntries(languages.map((l) => [l, 'You have completed the experiment.'])),
					feedbackWidgets: []
				};
			}}
			class="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer"
		>
			Add Completion Config
		</button>
	{/if}
</div>
