<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import Field from './Field.svelte';
	import { updatePath, phaseTypes, orderTypes, widgetTypes } from './helpers';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages }: { config: ExperimentConfig; languages: string[] } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);

	function addPhase() {
		const newId = `phase_${Date.now()}`;
		config.phases.push({
			id: newId,
			slug: newId,
			type: 'stimulus-response',
			title: Object.fromEntries(languages.map((l) => [l, ''])),
			responseWidgets: [],
			stimulusOrder: 'sequential',
			allowRevisit: true,
			allowMultipleResponses: false,
			completion: {
				title: Object.fromEntries(languages.map((l) => [l, 'Complete'])),
				body: Object.fromEntries(languages.map((l) => [l, 'You have completed this phase.']))
			}
		});
	}

	function removePhase(index: number) {
		if (config.phases.length <= 1) return;
		config.phases.splice(index, 1);
	}

	function addWidget(phaseIndex: number) {
		const newId = `widget_${Date.now()}`;
		const newWidget = { id: newId, type: 'text' as const, label: Object.fromEntries(languages.map((l) => [l, ''])), required: true };
		if (config.phases[phaseIndex].type === 'review') {
			if (!config.phases[phaseIndex].reviewConfig) {
				config.phases[phaseIndex].reviewConfig = { sourcePhase: '', filterEmpty: true, replayMode: 'segment', responseWidgets: [] };
			}
			config.phases[phaseIndex].reviewConfig!.responseWidgets.push(newWidget);
		} else {
			config.phases[phaseIndex].responseWidgets.push(newWidget);
		}
	}

	function removeWidget(phaseIndex: number, widgetIndex: number) {
		if (config.phases[phaseIndex].type === 'review') {
			config.phases[phaseIndex].reviewConfig?.responseWidgets.splice(widgetIndex, 1);
		} else {
			config.phases[phaseIndex].responseWidgets.splice(widgetIndex, 1);
		}
	}

	function widgetPath(pi: number, wi: number, field: string): string[] {
		if (config.phases[pi].type === 'review') {
			return ['phases', String(pi), 'reviewConfig', 'responseWidgets', String(wi), field];
		}
		return ['phases', String(pi), 'responseWidgets', String(wi), field];
	}

	function addWidgetOption(pi: number, wi: number) {
		const widgets = config.phases[pi].type === 'review'
			? config.phases[pi].reviewConfig!.responseWidgets
			: config.phases[pi].responseWidgets;
		const widget = widgets[wi];
		if (!widget.config) widget.config = {};
		if (!widget.config.options) widget.config.options = [];
		widget.config.options.push({
			value: `option_${Date.now()}`,
			label: Object.fromEntries(languages.map((l) => [l, '']))
		});
	}

	function removeWidgetOption(pi: number, wi: number, oi: number) {
		const widgets = config.phases[pi].type === 'review'
			? config.phases[pi].reviewConfig!.responseWidgets
			: config.phases[pi].responseWidgets;
		widgets[wi].config!.options!.splice(oi, 1);
	}

	function getWidgetsForPhase(pi: number) {
		return config.phases[pi].type === 'review'
			? (config.phases[pi].reviewConfig?.responseWidgets ?? [])
			: config.phases[pi].responseWidgets;
	}

	function addSkipRule(pi: number) {
		if (!config.phases[pi].skipRules) config.phases[pi].skipRules = [];
		config.phases[pi].skipRules!.push({
			targetStimulusId: '',
			condition: { stimulusId: '', widgetId: '', operator: 'equals', value: '' }
		});
	}

	function removeSkipRule(pi: number, ri: number) {
		config.phases[pi].skipRules?.splice(ri, 1);
	}

	function addBranchRule(pi: number) {
		if (!config.phases[pi].branchRules) config.phases[pi].branchRules = [];
		config.phases[pi].branchRules!.push({
			condition: { widgetId: '', operator: 'equals', value: '' },
			nextPhaseSlug: ''
		});
	}

	function removeBranchRule(pi: number, ri: number) {
		config.phases[pi].branchRules?.splice(ri, 1);
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<p class="text-sm text-gray-500">{config.phases.length} phase{config.phases.length === 1 ? '' : 's'}</p>
		<button type="button" onclick={addPhase} class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add Phase</button>
	</div>

	{#each config.phases as phase, pi}
		{@const phaseWidgets = phase.type === 'review' ? (phase.reviewConfig?.responseWidgets ?? []) : phase.responseWidgets}
		<div class="border border-gray-200 rounded-lg overflow-hidden">
			<div class="bg-gray-50 px-4 py-3 flex items-center justify-between">
				<span class="text-sm font-medium text-gray-700">Phase {pi + 1}: <span class="font-mono text-gray-500">{phase.slug}</span></span>
				<button
					type="button"
					onclick={() => removePhase(pi)}
					disabled={config.phases.length <= 1}
					class="text-xs text-red-500 hover:text-red-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
				>Remove</button>
			</div>
			<div class="p-4 space-y-3">
				<div class="grid grid-cols-3 gap-3">
					<Field label="ID">
						<input type="text" value={phase.id}
							oninput={(e) => update(['phases', String(pi), 'id'], e.currentTarget.value)}
							class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
					</Field>
					<Field label="Slug">
						<input type="text" value={phase.slug}
							oninput={(e) => update(['phases', String(pi), 'slug'], e.currentTarget.value)}
							class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
					</Field>
					<Field label="Type">
						<select
							value={phase.type}
							onchange={(e) => {
								const newType = e.currentTarget.value;
								update(['phases', String(pi), 'type'], newType);
								if (newType === 'review') {
									delete config.phases[pi].gatekeeperQuestion;
								} else {
									delete config.phases[pi].reviewConfig;
								}
							}}
							class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
						>
							{#each phaseTypes as t}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</Field>
				</div>

				{#if phase.type === 'stimulus-response'}
				<div class="grid grid-cols-3 gap-3">
					<Field label="Stimulus Order">
						<select value={phase.stimulusOrder}
							onchange={(e) => update(['phases', String(pi), 'stimulusOrder'], e.currentTarget.value)}
							class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
							{#each orderTypes as t}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</Field>
					<label class="flex items-end gap-2 text-sm">
						<input type="checkbox" checked={phase.allowRevisit} onchange={(e) => update(['phases', String(pi), 'allowRevisit'], e.currentTarget.checked)} />
						Allow Revisit
					</label>
					<label class="flex items-end gap-2 text-sm">
						<input type="checkbox" checked={phase.allowMultipleResponses} onchange={(e) => update(['phases', String(pi), 'allowMultipleResponses'], e.currentTarget.checked)} />
						Multiple Responses
					</label>
				</div>
				{/if}

				<LocalizedInput label="Title" value={phase.title} {languages} onchange={(v) => update(['phases', String(pi), 'title'], v)} />

				<!-- Per-phase Introduction -->
				<div class="border-t border-gray-100 pt-3 mt-1">
					<div class="flex items-center justify-between mb-2">
						<h5 class="text-xs font-medium text-gray-500">Introduction (shown before first stimulus)</h5>
						{#if phase.introduction}
							<button type="button" onclick={() => { delete config.phases[pi].introduction; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
						{:else}
							<button type="button" onclick={() => { config.phases[pi].introduction = { title: Object.fromEntries(languages.map((l) => [l, ''])), body: Object.fromEntries(languages.map((l) => [l, ''])) }; }} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
						{/if}
					</div>
					{#if phase.introduction}
						<div class="space-y-2 pl-2 border-l-2 border-indigo-200">
							<LocalizedInput label="Title" value={phase.introduction.title} {languages} onchange={(v) => update(['phases', String(pi), 'introduction', 'title'], v)} />
							<LocalizedInput label="Body" value={phase.introduction.body} {languages} multiline onchange={(v) => update(['phases', String(pi), 'introduction', 'body'], v)} />
						</div>
					{/if}
				</div>

				<!-- Gatekeeper Question -->
				{#if phase.type === 'stimulus-response'}
					<div class="border-t border-gray-100 pt-3 mt-3">
						<div class="flex items-center justify-between mb-2">
							<h5 class="text-xs font-medium text-gray-500">Gatekeeper Question</h5>
							{#if phase.gatekeeperQuestion}
								<button type="button" onclick={() => { delete config.phases[pi].gatekeeperQuestion; config.phases[pi] = config.phases[pi]; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
							{:else}
								<button type="button" onclick={() => {
									config.phases[pi].gatekeeperQuestion = {
										initial: {
											text: Object.fromEntries(languages.map((l) => [l, ''])),
											yesLabel: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'Yes' : 'はい'])),
											noLabel: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'No' : 'いいえ']))
										},
										skipToNext: true
									};
								}} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
							{/if}
						</div>
						{#if phase.gatekeeperQuestion}
							<div class="space-y-3 pl-2 border-l-2 border-indigo-200">
								<div class="space-y-2">
									<p class="text-[11px] uppercase tracking-wide text-gray-400 font-medium">First encounter</p>
									<LocalizedInput label="Question Text" value={phase.gatekeeperQuestion.initial.text} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'initial', 'text'], v)} />
									<div class="grid grid-cols-2 gap-2">
										<LocalizedInput label="Yes Label" value={phase.gatekeeperQuestion.initial.yesLabel} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'initial', 'yesLabel'], v)} />
										<LocalizedInput label="No Label" value={phase.gatekeeperQuestion.initial.noLabel} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'initial', 'noLabel'], v)} />
									</div>
								</div>
								<div class="space-y-2">
									<div class="flex items-center justify-between">
										<p class="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Subsequent encounter <span class="normal-case font-normal text-gray-400">(optional override; falls back to "First")</span></p>
										{#if phase.gatekeeperQuestion.subsequent}
											<button type="button" onclick={() => { delete config.phases[pi].gatekeeperQuestion!.subsequent; config.phases[pi] = config.phases[pi]; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
										{:else}
											<button type="button" onclick={() => {
												config.phases[pi].gatekeeperQuestion!.subsequent = {
													text: Object.fromEntries(languages.map((l) => [l, ''])),
													yesLabel: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'Yes, add another' : 'はい、追加'])),
													noLabel: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'No, done' : 'いいえ、完了']))
												};
											}} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
										{/if}
									</div>
									{#if phase.gatekeeperQuestion.subsequent}
										<LocalizedInput label="Question Text" value={phase.gatekeeperQuestion.subsequent.text} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'subsequent', 'text'], v)} />
										<div class="grid grid-cols-2 gap-2">
											<LocalizedInput label="Yes Label" value={phase.gatekeeperQuestion.subsequent.yesLabel} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'subsequent', 'yesLabel'], v)} />
											<LocalizedInput label="No Label" value={phase.gatekeeperQuestion.subsequent.noLabel} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'subsequent', 'noLabel'], v)} />
										</div>
									{/if}
								</div>
								<label class="flex items-center gap-2 text-sm">
									<input type="checkbox" checked={phase.gatekeeperQuestion.skipToNext ?? true} onchange={(e) => update(['phases', String(pi), 'gatekeeperQuestion', 'skipToNext'], e.currentTarget.checked)} />
									Skip to Next on No
								</label>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Review config -->
				{#if phase.type === 'review'}
					<div class="border-t border-gray-100 pt-3 mt-3">
						<h5 class="text-xs font-medium text-gray-500 mb-2">Review Config</h5>
						<div class="grid grid-cols-2 gap-3">
							<Field label="Source Phase">
								<select
									value={phase.reviewConfig?.sourcePhase ?? ''}
									onchange={(e) => {
										if (!config.phases[pi].reviewConfig) {
											config.phases[pi].reviewConfig = { sourcePhase: '', filterEmpty: true, replayMode: 'segment', responseWidgets: [] };
										}
										config.phases[pi].reviewConfig!.sourcePhase = e.currentTarget.value;
									}}
									class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
								>
									<option value="">-- Select --</option>
									{#each config.phases.filter((_, j) => j !== pi) as p}
										<option value={p.id}>{p.slug}</option>
									{/each}
								</select>
							</Field>
							<label class="flex items-end gap-2 text-sm">
								<input type="checkbox" checked={phase.reviewConfig?.filterEmpty ?? true}
									onchange={(e) => {
										if (!config.phases[pi].reviewConfig) {
											config.phases[pi].reviewConfig = { sourcePhase: '', filterEmpty: true, replayMode: 'segment', responseWidgets: [] };
										}
										config.phases[pi].reviewConfig!.filterEmpty = e.currentTarget.checked;
									}} />
								Filter Empty
							</label>
						</div>
						<div class="mt-2">
							<Field label="Replay Mode">
								<select
									value={phase.reviewConfig?.replayMode ?? 'segment'}
									onchange={(e) => {
										if (!config.phases[pi].reviewConfig) {
											config.phases[pi].reviewConfig = { sourcePhase: '', filterEmpty: true, replayMode: 'segment', responseWidgets: [] };
										}
										config.phases[pi].reviewConfig!.replayMode = e.currentTarget.value as 'segment' | 'full-highlight';
									}}
									class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
								>
									<option value="segment">Segment only (replay between timestamps)</option>
									<option value="full-highlight">Full video (highlight border during timestamps)</option>
								</select>
							</Field>
						</div>
					</div>
				{/if}

				<!-- Response Widgets -->
				<div class="border-t border-gray-100 pt-3 mt-3">
					<div class="flex items-center justify-between mb-2">
						<h5 class="text-xs font-medium text-gray-500">Response Widgets ({phaseWidgets.length})</h5>
						<button type="button" onclick={() => addWidget(pi)} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
					</div>

					{#each phaseWidgets as widget, wi}
						<div class="border border-gray-200 rounded p-3 mb-2 space-y-2">
							<div class="flex items-center justify-between">
								<span class="text-xs font-mono text-gray-400">{widget.id}</span>
								<button type="button" onclick={() => removeWidget(pi, wi)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
							</div>
							<div class="grid grid-cols-3 gap-2">
								<Field label="ID">
									<input type="text" value={widget.id}
										oninput={(e) => update(widgetPath(pi, wi, 'id'), e.currentTarget.value)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
								</Field>
								<Field label="Type">
									<select value={widget.type}
										onchange={(e) => update(widgetPath(pi, wi, 'type'), e.currentTarget.value)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
										{#each widgetTypes as t}
											<option value={t}>{t}</option>
										{/each}
									</select>
								</Field>
								<label class="flex items-end gap-2 text-xs">
									<input type="checkbox" checked={widget.required}
										onchange={(e) => update(widgetPath(pi, wi, 'required'), e.currentTarget.checked)} />
									Required
								</label>
							</div>
							<LocalizedInput label="Label" value={widget.label} {languages} onchange={(v) => update(widgetPath(pi, wi, 'label'), v)} />
							{#if ['text', 'textarea', 'number'].includes(widget.type)}
								<LocalizedInput label="Placeholder" value={widget.placeholder ?? {}} {languages} onchange={(v) => update(widgetPath(pi, wi, 'placeholder'), Object.values(v).some(Boolean) ? v : undefined)} />
							{/if}
							<div class="grid grid-cols-2 gap-2">
								<Field label="Step Number">
									<input type="number" value={widget.stepNumber ?? ''}
										oninput={(e) => update(widgetPath(pi, wi, 'stepNumber'), e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Optional" />
								</Field>
								<div>
									<LocalizedInput label="Step Label" value={widget.stepLabel ?? {}} {languages} onchange={(v) => update(widgetPath(pi, wi, 'stepLabel'), Object.values(v).some(Boolean) ? v : undefined)} />
								</div>
							</div>

							<!-- Options for select/multiselect -->
							{#if widget.type === 'select' || widget.type === 'multiselect'}
								<div class="border-t border-gray-100 pt-2 mt-2">
									<div class="flex items-center justify-between mb-1">
										<span class="text-xs text-gray-500">Options ({widget.config?.options?.length ?? 0})</span>
										<button type="button" onclick={() => addWidgetOption(pi, wi)} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
									</div>
									{#each widget.config?.options ?? [] as option, oi}
										{@const optPath = [...widgetPath(pi, wi, 'config'), 'options', String(oi)]}
										<div class="flex items-start gap-2 mb-1">
											<input type="text" value={option.value}
												oninput={(e) => update([...optPath, 'value'], e.currentTarget.value)}
												aria-label="Option value"
												class="w-24 shrink-0 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="value" />
											<div class="flex-1">
												<LocalizedInput label="" value={option.label} {languages} onchange={(v) => update([...optPath, 'label'], v)} />
											</div>
											<button type="button" onclick={() => removeWidgetOption(pi, wi, oi)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer mt-1">x</button>
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
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'min'], e.currentTarget.valueAsNumber)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
										<Field label="Max">
											<input type="number" value={widget.config?.max ?? (widget.type === 'likert' ? 7 : 100)}
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'max'], e.currentTarget.valueAsNumber)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
										{#if widget.type === 'slider'}
											<Field label="Step">
												<input type="number" value={widget.config?.step ?? 1}
													oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'step'], e.currentTarget.valueAsNumber)}
													class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
											</Field>
										{/if}
									</div>
									<div class="grid grid-cols-2 gap-2 mt-2">
										<LocalizedInput label="Min label" value={widget.config?.minLabel ?? {}} {languages} onchange={(v) => update([...widgetPath(pi, wi, 'config'), 'minLabel'], v)} />
										<LocalizedInput label="Max label" value={widget.config?.maxLabel ?? {}} {languages} onchange={(v) => update([...widgetPath(pi, wi, 'config'), 'maxLabel'], v)} />
									</div>
								</div>
							{/if}

							<!-- Textarea config -->
							{#if widget.type === 'textarea'}
								<div class="border-t border-gray-100 pt-2 mt-2 space-y-2">
									<span class="text-xs text-gray-500 block">Textarea config</span>
									<label class="flex items-center gap-2 text-xs">
										<input type="checkbox" checked={widget.config?.showCharCount ?? false}
											onchange={(e) => update([...widgetPath(pi, wi, 'config'), 'showCharCount'], e.currentTarget.checked)} />
										Show character count
									</label>
									<div class="grid grid-cols-2 gap-2">
										<Field label="Min length">
											<input type="number" value={widget.config?.minLength ?? ''}
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'minLength'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
										<Field label="Max length">
											<input type="number" value={widget.config?.maxLength ?? ''}
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'maxLength'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
									</div>
								</div>
							{/if}

							<!-- Number config -->
							{#if widget.type === 'number'}
								<div class="border-t border-gray-100 pt-2 mt-2">
									<span class="text-xs text-gray-500 block mb-1">Number config</span>
									<div class="grid grid-cols-3 gap-2">
										<Field label="Min">
											<input type="number" value={widget.config?.min ?? ''}
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'min'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
										<Field label="Max">
											<input type="number" value={widget.config?.max ?? ''}
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'max'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
										<Field label="Step">
											<input type="number" value={widget.config?.step ?? 1}
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'step'], e.currentTarget.valueAsNumber)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
									</div>
								</div>
							{/if}

							<!-- Timestamp-range config -->
							{#if widget.type === 'timestamp-range'}
								<div class="border-t border-gray-100 pt-2 mt-2 space-y-2">
									<div class="grid grid-cols-2 gap-2">
										<LocalizedInput label="Start button label" value={widget.config?.captureStartLabel ?? {}} {languages} onchange={(v) => update([...widgetPath(pi, wi, 'config'), 'captureStartLabel'], v)} />
										<LocalizedInput label="End button label" value={widget.config?.captureEndLabel ?? {}} {languages} onchange={(v) => update([...widgetPath(pi, wi, 'config'), 'captureEndLabel'], v)} />
									</div>
									<Field label="Review Mode">
										<select value={widget.config?.timestampReviewMode ?? ''}
											onchange={(e) => update([...widgetPath(pi, wi, 'config'), 'timestampReviewMode'], e.currentTarget.value || undefined)}
											class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
											<option value="">None (no review button)</option>
											<option value="segment">Segment replay (start to end only)</option>
											<option value="full-highlight">Full video with highlight border</option>
										</select>
									</Field>
								</div>
							{/if}

							<!-- Audio-recording config -->
							{#if widget.type === 'audio-recording'}
								<div class="border-t border-gray-100 pt-2 mt-2">
									<span class="text-xs text-gray-500 block mb-1">Recording config</span>
									<div class="grid grid-cols-2 gap-2">
										<Field label="Max duration (seconds)">
											<input type="number" value={widget.config?.maxDurationSeconds ?? 120}
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'maxDurationSeconds'], e.currentTarget.valueAsNumber)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
										<Field label="Max file size (MB)">
											<input type="number" value={widget.config?.maxFileSizeMB ?? 50}
												oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'maxFileSizeMB'], e.currentTarget.valueAsNumber)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
										</Field>
									</div>
								</div>
							{/if}

							<!-- Conditional Visibility -->
							{#if phaseWidgets.length > 1}
								<div class="border-t border-gray-100 pt-2 mt-2">
									<div class="flex items-center justify-between mb-1">
										<span class="text-xs text-gray-500">Conditional Visibility</span>
										{#if widget.conditionalOn}
											<button type="button" onclick={() => {
												const widgets = getWidgetsForPhase(pi);
												delete widgets[wi].conditionalOn;
											}} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
										{:else}
											<button type="button" onclick={() => {
												const widgets = getWidgetsForPhase(pi);
												const others = phaseWidgets.filter((_, j) => j !== wi);
												widgets[wi].conditionalOn = { widgetId: others[0]?.id ?? '', value: '' };
											}} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
										{/if}
									</div>
									{#if widget.conditionalOn}
										<div class="grid grid-cols-2 gap-2 pl-2 border-l-2 border-indigo-200">
											<Field label="Show when widget">
												<select value={widget.conditionalOn.widgetId}
													onchange={(e) => update([...widgetPath(pi, wi, 'conditionalOn'), 'widgetId'], e.currentTarget.value)}
													class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
													{#each phaseWidgets.filter((_, j) => j !== wi) as other}
														<option value={other.id}>{other.id}</option>
													{/each}
												</select>
											</Field>
											<Field label="equals value">
												<input type="text" value={widget.conditionalOn.value}
													oninput={(e) => update([...widgetPath(pi, wi, 'conditionalOn'), 'value'], e.currentTarget.value)}
													class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
											</Field>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Phase Completion -->
				<div class="border-t border-gray-100 pt-3 mt-3">
					<h5 class="text-xs font-medium text-gray-500 mb-2">Completion</h5>
					<LocalizedInput label="Title" value={phase.completion.title} {languages} onchange={(v) => update(['phases', String(pi), 'completion', 'title'], v)} />
					<div class="mt-2">
						<LocalizedInput label="Body" value={phase.completion.body} {languages} multiline onchange={(v) => update(['phases', String(pi), 'completion', 'body'], v)} />
					</div>
					<div class="mt-3">
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-gray-500">Continue button label</span>
							{#if phase.completion.nextPhaseButton}
								<button type="button" onclick={() => { delete config.phases[pi].completion.nextPhaseButton; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
							{:else}
								<button type="button" onclick={() => { config.phases[pi].completion.nextPhaseButton = Object.fromEntries(languages.map((l) => [l, ''])); }} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Customize</button>
							{/if}
						</div>
						{#if phase.completion.nextPhaseButton}
							<LocalizedInput label="" value={phase.completion.nextPhaseButton} {languages} onchange={(v) => update(['phases', String(pi), 'completion', 'nextPhaseButton'], v)} />
						{/if}
					</div>
					<div class="mt-2">
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-gray-500">Stay button label</span>
							{#if phase.completion.stayButton}
								<button type="button" onclick={() => { delete config.phases[pi].completion.stayButton; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
							{:else}
								<button type="button" onclick={() => { config.phases[pi].completion.stayButton = Object.fromEntries(languages.map((l) => [l, ''])); }} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Customize</button>
							{/if}
						</div>
						{#if phase.completion.stayButton}
							<LocalizedInput label="" value={phase.completion.stayButton} {languages} onchange={(v) => update(['phases', String(pi), 'completion', 'stayButton'], v)} />
						{/if}
					</div>
				</div>

				<!-- Skip Rules (stimulus-response only) -->
				{#if phase.type === 'stimulus-response'}
					<div class="border-t border-gray-100 pt-3 mt-3">
						<div class="flex items-center justify-between mb-2">
							<h5 class="text-xs font-medium text-gray-500">Skip Rules ({phase.skipRules?.length ?? 0})</h5>
							<button type="button" onclick={() => addSkipRule(pi)} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
						</div>
						{#if phase.skipRules?.length}
							<p class="text-xs text-gray-400 mb-2">Skip a stimulus when a response condition is met.</p>
						{/if}
						{#each phase.skipRules ?? [] as rule, ri}
							{@const rulePath = ['phases', String(pi), 'skipRules', String(ri)]}
							<div class="border border-gray-200 rounded p-2 mb-2 space-y-2">
								<div class="flex items-center justify-between">
									<span class="text-xs text-gray-400">Rule {ri + 1}</span>
									<button type="button" onclick={() => removeSkipRule(pi, ri)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
								</div>
								<Field label="Skip stimulus">
									<select value={rule.targetStimulusId}
										onchange={(e) => update([...rulePath, 'targetStimulusId'], e.currentTarget.value)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
										<option value="">-- Select target --</option>
										{#each config.stimuli?.items ?? [] as stim}
											<option value={stim.id}>{stim.id}</option>
										{/each}
									</select>
								</Field>
								<div class="grid grid-cols-2 gap-2">
									<Field label="When stimulus">
										<select value={rule.condition.stimulusId}
											onchange={(e) => update([...rulePath, 'condition', 'stimulusId'], e.currentTarget.value)}
											class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
											<option value="">-- Select source --</option>
											{#each config.stimuli?.items ?? [] as stim}
												<option value={stim.id}>{stim.id}</option>
											{/each}
										</select>
									</Field>
									<Field label="Widget">
										<select value={rule.condition.widgetId}
											onchange={(e) => update([...rulePath, 'condition', 'widgetId'], e.currentTarget.value)}
											class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
											<option value="">-- Select --</option>
											{#each phaseWidgets as w}
												<option value={w.id}>{w.id}</option>
											{/each}
										</select>
									</Field>
								</div>
								<div class="grid grid-cols-2 gap-2">
									<Field label="Operator">
										<select value={rule.condition.operator ?? 'equals'}
											onchange={(e) => update([...rulePath, 'condition', 'operator'], e.currentTarget.value)}
											class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
											<option value="equals">equals</option>
											<option value="not_equals">not equals</option>
										</select>
									</Field>
									<Field label="Value">
										<input type="text" value={rule.condition.value}
											oninput={(e) => update([...rulePath, 'condition', 'value'], e.currentTarget.value)}
											class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
									</Field>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Branch Rules -->
				<div class="border-t border-gray-100 pt-3 mt-3">
					<div class="flex items-center justify-between mb-2">
						<h5 class="text-xs font-medium text-gray-500">Branch Rules ({phase.branchRules?.length ?? 0})</h5>
						<button type="button" onclick={() => addBranchRule(pi)} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
					</div>
					{#if phase.branchRules?.length}
						<p class="text-xs text-gray-400 mb-2">Override next phase based on responses. First match wins; fallback is sequential.</p>
					{/if}
					{#each phase.branchRules ?? [] as rule, ri}
						{@const brPath = ['phases', String(pi), 'branchRules', String(ri)]}
						<div class="border border-gray-200 rounded p-2 mb-2 space-y-2">
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-400">Rule {ri + 1}</span>
								<button type="button" onclick={() => removeBranchRule(pi, ri)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<Field label="Widget">
									<select value={rule.condition.widgetId}
										onchange={(e) => update([...brPath, 'condition', 'widgetId'], e.currentTarget.value)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
										<option value="">-- Select --</option>
										{#each phaseWidgets as w}
											<option value={w.id}>{w.id}</option>
										{/each}
									</select>
								</Field>
								<Field label="On stimulus (optional)">
									<select value={rule.condition.stimulusId ?? ''}
										onchange={(e) => update([...brPath, 'condition', 'stimulusId'], e.currentTarget.value || undefined)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
										<option value="">Any stimulus</option>
										{#each config.stimuli?.items ?? [] as stim}
											<option value={stim.id}>{stim.id}</option>
										{/each}
									</select>
								</Field>
							</div>
							<div class="grid grid-cols-3 gap-2">
								<Field label="Operator">
									<select value={rule.condition.operator ?? 'equals'}
										onchange={(e) => update([...brPath, 'condition', 'operator'], e.currentTarget.value)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
										<option value="equals">equals</option>
										<option value="not_equals">not equals</option>
									</select>
								</Field>
								<Field label="Value">
									<input type="text" value={rule.condition.value}
										oninput={(e) => update([...brPath, 'condition', 'value'], e.currentTarget.value)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
								</Field>
								<Field label="Go to phase">
									<select value={rule.nextPhaseSlug}
										onchange={(e) => update([...brPath, 'nextPhaseSlug'], e.currentTarget.value)}
										class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
										<option value="">-- Select --</option>
										{#each config.phases.filter((_, j) => j !== pi) as p}
											<option value={p.slug}>{p.slug}</option>
										{/each}
									</select>
								</Field>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/each}
</div>
