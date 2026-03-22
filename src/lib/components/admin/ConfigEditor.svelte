<script lang="ts">
	import FormSection from './FormSection.svelte';
	import LocalizedInput from './LocalizedInput.svelte';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, experimentId }: { config: ExperimentConfig; experimentId?: string } = $props();

	let languages = $derived(config.metadata?.languages ?? ['en']);

	// --- Storage check ---
	type StorageCheckState = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; count: number; files: string[] } | { status: 'error'; message: string };
	let storageCheck = $state<StorageCheckState>({ status: 'idle' });

	async function checkStorage() {
		if (!experimentId || !config.stimuli.storagePath) return;
		storageCheck = { status: 'loading' };
		try {
			const res = await fetch(`/admin/experiments/${experimentId}/storage-check?path=${encodeURIComponent(config.stimuli.storagePath)}`);
			const body = await res.json();
			if (body.error) {
				storageCheck = { status: 'error', message: body.error };
			} else {
				storageCheck = { status: 'ok', count: body.count, files: body.files };
			}
		} catch {
			storageCheck = { status: 'error', message: 'Request failed' };
		}
	}

	// Direct mutation helpers — no clone/onchange needed because config IS the parent's $state proxy
	function update(path: string[], value: unknown) {
		let target: Record<string, unknown> = config as Record<string, unknown>;
		for (let i = 0; i < path.length - 1; i++) {
			if (target[path[i]] == null) target[path[i]] = {};
			target = target[path[i]] as Record<string, unknown>;
		}
		target[path[path.length - 1]] = value;
	}

	// --- Registration field helpers ---
	function addRegistrationField() {
		const newId = `field_${Date.now()}`;
		config.registration.fields.push({
			id: newId,
			type: 'text',
			label: Object.fromEntries(languages.map((l) => [l, ''])),
			required: true
		});
	}

	function removeRegistrationField(index: number) {
		config.registration.fields.splice(index, 1);
	}

	// --- Phase helpers ---
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

	// --- Widget helpers ---
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

	// --- Widget option helpers ---
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

	// --- Registration field option helpers ---
	function addFieldOption(fi: number) {
		const field = config.registration.fields[fi];
		if (!field.options) field.options = [];
		field.options.push({
			value: `option_${Date.now()}`,
			label: Object.fromEntries(languages.map((l) => [l, '']))
		});
	}

	function removeFieldOption(fi: number, oi: number) {
		config.registration.fields[fi].options!.splice(oi, 1);
	}

	// --- Stimulus item helpers ---
	function addStimulusItem() {
		const newId = `stim_${Date.now()}`;
		config.stimuli.items.push({ id: newId });
	}

	function removeStimulusItem(index: number) {
		config.stimuli.items.splice(index, 1);
	}

	const fieldTypes = ['text', 'number', 'email', 'select', 'multiselect', 'textarea'] as const;
	const widgetTypes = ['text', 'textarea', 'select', 'multiselect', 'likert', 'timestamp-range', 'audio-recording', 'slider', 'number'] as const;
	const stimulusTypes = ['video', 'image', 'audio', 'text', 'mixed'] as const;
	const sourceTypes = ['upload', 'external-urls', 'supabase-storage'] as const;
	const phaseTypes = ['stimulus-response', 'review'] as const;
	const orderTypes = ['sequential', 'random', 'random-per-participant'] as const;
</script>

<div class="space-y-4">
	<!-- Metadata -->
	<FormSection title="Metadata" open>
		<div class="space-y-4">
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Slug</label>
					<input
						type="text"
						value={config.slug}
						oninput={(e) => update(['slug'], e.currentTarget.value)}
						class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Default Language</label>
					<select
						value={config.metadata.defaultLanguage}
						onchange={(e) => update(['metadata', 'defaultLanguage'], e.currentTarget.value)}
						class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
					>
						{#each languages as lang}
							<option value={lang}>{lang.toUpperCase()}</option>
						{/each}
					</select>
				</div>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Languages</label>
				<input
					type="text"
					value={languages.join(', ')}
					oninput={(e) => {
						const langs = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean);
						update(['metadata', 'languages'], langs);
					}}
					class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
					placeholder="en, ja"
				/>
				<p class="mt-1 text-xs text-gray-400">Comma-separated language codes</p>
			</div>

			<LocalizedInput label="Title" value={config.metadata.title} {languages} onchange={(v) => update(['metadata', 'title'], v)} />
			<LocalizedInput label="Description" value={config.metadata.description ?? {}} {languages} multiline onchange={(v) => update(['metadata', 'description'], v)} />
		</div>
	</FormSection>

	<!-- Registration -->
	<FormSection title="Registration">
		<div class="space-y-4">
			<h4 class="text-sm font-medium text-gray-600">Introduction</h4>
			<LocalizedInput label="Title" value={config.registration.introduction.title} {languages} onchange={(v) => update(['registration', 'introduction', 'title'], v)} />
			<LocalizedInput label="Body" value={config.registration.introduction.body} {languages} multiline onchange={(v) => update(['registration', 'introduction', 'body'], v)} />

			<div class="flex items-center justify-between mt-4">
				<h4 class="text-sm font-medium text-gray-600">Fields ({config.registration.fields.length})</h4>
				<button type="button" onclick={addRegistrationField} class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add Field</button>
			</div>

			{#each config.registration.fields as field, i}
				<div class="border border-gray-200 rounded p-4 space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-mono text-gray-400">{field.id}</span>
						<button type="button" onclick={() => removeRegistrationField(i)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
					</div>
					<div class="grid grid-cols-3 gap-3">
						<div>
							<label class="block text-xs text-gray-500 mb-1">ID</label>
							<input
								type="text"
								value={field.id}
								oninput={(e) => update(['registration', 'fields', String(i), 'id'], e.currentTarget.value)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div>
							<label class="block text-xs text-gray-500 mb-1">Type</label>
							<select
								value={field.type}
								onchange={(e) => update(['registration', 'fields', String(i), 'type'], e.currentTarget.value)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							>
								{#each fieldTypes as t}
									<option value={t}>{t}</option>
								{/each}
							</select>
						</div>
						<div class="flex items-end">
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={field.required}
									onchange={(e) => update(['registration', 'fields', String(i), 'required'], e.currentTarget.checked)}
								/>
								Required
							</label>
						</div>
					</div>
					<LocalizedInput label="Label" value={field.label} {languages} onchange={(v) => update(['registration', 'fields', String(i), 'label'], v)} />
					<!-- Validation config -->
					<div class="border-t border-gray-100 pt-2 mt-2">
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-gray-500">Validation</span>
							{#if field.validation}
								<button type="button" onclick={() => { delete config.registration.fields[i].validation; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
							{:else}
								<button type="button" onclick={() => { config.registration.fields[i].validation = { errorMessage: Object.fromEntries(languages.map((l) => [l, ''])) }; }} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
							{/if}
						</div>
						{#if field.validation}
							<div class="pl-2 border-l-2 border-indigo-200 space-y-2">
								{#if field.type === 'number'}
									<div class="grid grid-cols-2 gap-2">
										<div>
											<label class="block text-xs text-gray-400 mb-0.5">Min</label>
											<input type="number" value={field.validation.min ?? ''}
												oninput={(e) => update(['registration', 'fields', String(i), 'validation', 'min'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="â" />
										</div>
										<div>
											<label class="block text-xs text-gray-400 mb-0.5">Max</label>
											<input type="number" value={field.validation.max ?? ''}
												oninput={(e) => update(['registration', 'fields', String(i), 'validation', 'max'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="â" />
										</div>
									</div>
								{:else}
									<div>
										<label class="block text-xs text-gray-400 mb-0.5">Pattern (regex)</label>
										<input type="text" value={field.validation.pattern ?? ''}
											oninput={(e) => update(['registration', 'fields', String(i), 'validation', 'pattern'], e.currentTarget.value || undefined)}
											class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="^[A-Za-z]+$" />
									</div>
								{/if}
								<LocalizedInput label="Error message" value={field.validation.errorMessage ?? {}} {languages} onchange={(v) => update(['registration', 'fields', String(i), 'validation', 'errorMessage'], v)} />
							</div>
						{/if}
					</div>

					<!-- Options for select/multiselect registration fields -->
					{#if field.type === 'select' || field.type === 'multiselect'}
						<div class="border-t border-gray-100 pt-2 mt-2">
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs text-gray-500">Options ({field.options?.length ?? 0})</span>
								<button type="button" onclick={() => addFieldOption(i)} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
							</div>
							{#each field.options ?? [] as option, oi}
								<div class="flex items-start gap-2 mb-1">
									<input
										type="text"
										value={option.value}
										oninput={(e) => update(['registration', 'fields', String(i), 'options', String(oi), 'value'], e.currentTarget.value)}
										class="w-24 shrink-0 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
										placeholder="value"
									/>
									<div class="flex-1">
										<LocalizedInput label="" value={option.label} {languages} onchange={(v) => update(['registration', 'fields', String(i), 'options', String(oi), 'label'], v)} />
									</div>
									<button type="button" onclick={() => removeFieldOption(i, oi)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer mt-1">×</button>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Conditional visibility -->
					<div class="border-t border-gray-100 pt-2 mt-2">
						<div class="flex items-center justify-between mb-1">
							<span class="text-xs text-gray-500">Conditional visibility</span>
							{#if field.conditionalOn}
								<button type="button" onclick={() => { delete config.registration.fields[i].conditionalOn; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
							{:else}
								<button type="button" onclick={() => { config.registration.fields[i].conditionalOn = { field: '', value: '' }; }} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
							{/if}
						</div>
						{#if field.conditionalOn}
							<div class="pl-2 border-l-2 border-indigo-200">
								<p class="text-xs text-gray-400 mb-1.5">Show this field only when:</p>
								<div class="flex items-center gap-2">
									<select
										value={field.conditionalOn.field}
										onchange={(e) => update(['registration', 'fields', String(i), 'conditionalOn', 'field'], e.currentTarget.value)}
										class="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
									>
										<option value="">— select field —</option>
										{#each config.registration.fields.filter((_, j) => j !== i) as other}
											<option value={other.id}>{other.id}</option>
										{/each}
									</select>
									<span class="text-xs text-gray-400">=</span>
									<input
										type="text"
										value={field.conditionalOn.value}
										oninput={(e) => update(['registration', 'fields', String(i), 'conditionalOn', 'value'], e.currentTarget.value)}
										class="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
										placeholder="option value"
									/>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</FormSection>

	<!-- Phases -->
	<FormSection title="Phases" open>
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
						>
							Remove
						</button>
					</div>
					<div class="p-4 space-y-3">
						<div class="grid grid-cols-3 gap-3">
							<div>
								<label class="block text-xs text-gray-500 mb-1">ID</label>
								<input
									type="text"
									value={phase.id}
									oninput={(e) => update(['phases', String(pi), 'id'], e.currentTarget.value)}
									class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
								/>
							</div>
							<div>
								<label class="block text-xs text-gray-500 mb-1">Slug</label>
								<input
									type="text"
									value={phase.slug}
									oninput={(e) => update(['phases', String(pi), 'slug'], e.currentTarget.value)}
									class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
								/>
							</div>
							<div>
								<label class="block text-xs text-gray-500 mb-1">Type</label>
								<select
									value={phase.type}
									onchange={(e) => {
										const newType = e.currentTarget.value;
										update(['phases', String(pi), 'type'], newType);
										// Clean up fields that don't apply to the new type
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
							</div>
						</div>

						<!-- Stimulus Order / Allow Revisit / Multiple Responses: only for stimulus-response phases -->
						{#if phase.type === 'stimulus-response'}
						<div class="grid grid-cols-3 gap-3">
							<div>
								<label class="block text-xs text-gray-500 mb-1">Stimulus Order</label>
								<select
									value={phase.stimulusOrder}
									onchange={(e) => update(['phases', String(pi), 'stimulusOrder'], e.currentTarget.value)}
									class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
								>
									{#each orderTypes as t}
										<option value={t}>{t}</option>
									{/each}
								</select>
							</div>
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

						<!-- Gatekeeper Question (stimulus-response phases only) -->
						{#if phase.type === 'stimulus-response'}
							<div class="border-t border-gray-100 pt-3 mt-3">
								<div class="flex items-center justify-between mb-2">
									<h5 class="text-xs font-medium text-gray-500">Gatekeeper Question</h5>
									{#if phase.gatekeeperQuestion}
										<button type="button" onclick={() => { delete config.phases[pi].gatekeeperQuestion; config.phases[pi] = config.phases[pi]; }} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
									{:else}
										<button type="button" onclick={() => {
											config.phases[pi].gatekeeperQuestion = {
												text: Object.fromEntries(languages.map((l) => [l, ''])),
												yesLabel: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'Yes' : 'はい'])),
												noLabel: Object.fromEntries(languages.map((l) => [l, l === 'en' ? 'No' : 'いいえ'])),
												noResponseValue: 'null',
												skipToNext: true
											};
										}} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
									{/if}
								</div>
								{#if phase.gatekeeperQuestion}
									<div class="space-y-2 pl-2 border-l-2 border-indigo-200">
										<LocalizedInput label="Question Text" value={phase.gatekeeperQuestion.text} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'text'], v)} />
										<div class="grid grid-cols-2 gap-2">
											<LocalizedInput label="Yes Label" value={phase.gatekeeperQuestion.yesLabel} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'yesLabel'], v)} />
											<LocalizedInput label="No Label" value={phase.gatekeeperQuestion.noLabel} {languages} onchange={(v) => update(['phases', String(pi), 'gatekeeperQuestion', 'noLabel'], v)} />
										</div>
										<div class="grid grid-cols-2 gap-2">
											<div>
												<label class="block text-xs text-gray-500 mb-1">No Response Value</label>
												<input
													type="text"
													value={phase.gatekeeperQuestion.noResponseValue ?? 'null'}
													oninput={(e) => update(['phases', String(pi), 'gatekeeperQuestion', 'noResponseValue'], e.currentTarget.value)}
													class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
												/>
											</div>
											<label class="flex items-end gap-2 text-sm">
												<input type="checkbox" checked={phase.gatekeeperQuestion.skipToNext ?? true} onchange={(e) => update(['phases', String(pi), 'gatekeeperQuestion', 'skipToNext'], e.currentTarget.checked)} />
												Skip to Next on No
											</label>
										</div>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Review config (if type is review) -->
						{#if phase.type === 'review'}
							<div class="border-t border-gray-100 pt-3 mt-3">
								<h5 class="text-xs font-medium text-gray-500 mb-2">Review Config</h5>
								<div class="grid grid-cols-2 gap-3">
									<div>
										<label class="block text-xs text-gray-500 mb-1">Source Phase</label>
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
											<option value="">— Select —</option>
											{#each config.phases.filter((_, j) => j !== pi) as p}
												<option value={p.id}>{p.slug}</option>
											{/each}
										</select>
									</div>
									<label class="flex items-end gap-2 text-sm">
										<input
											type="checkbox"
											checked={phase.reviewConfig?.filterEmpty ?? true}
											onchange={(e) => {
												if (!config.phases[pi].reviewConfig) {
													config.phases[pi].reviewConfig = { sourcePhase: '', filterEmpty: true, replayMode: 'segment', responseWidgets: [] };
												}
												config.phases[pi].reviewConfig!.filterEmpty = e.currentTarget.checked;
											}}
										/>
										Filter Empty
									</label>
								</div>
								<div class="mt-2">
									<label class="block text-xs text-gray-500 mb-1">Replay Mode</label>
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
								</div>
							</div>
						{/if}
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
										<div>
											<label class="block text-xs text-gray-500 mb-0.5">ID</label>
											<input
												type="text"
												value={widget.id}
												oninput={(e) => update(widgetPath(pi, wi, 'id'), e.currentTarget.value)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
											/>
										</div>
										<div>
											<label class="block text-xs text-gray-500 mb-0.5">Type</label>
											<select
												value={widget.type}
												onchange={(e) => update(widgetPath(pi, wi, 'type'), e.currentTarget.value)}
												class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
											>
												{#each widgetTypes as t}
													<option value={t}>{t}</option>
												{/each}
											</select>
										</div>
										<label class="flex items-end gap-2 text-xs">
											<input
												type="checkbox"
												checked={widget.required}
												onchange={(e) => update(widgetPath(pi, wi, 'required'), e.currentTarget.checked)}
											/>
											Required
										</label>
									</div>
									<LocalizedInput
										label="Label"
										value={widget.label}
										{languages}
										onchange={(v) => update(widgetPath(pi, wi, 'label'), v)}
									/>

									<!-- Options for select/multiselect widgets -->
									{#if widget.type === 'select' || widget.type === 'multiselect'}
										<div class="border-t border-gray-100 pt-2 mt-2">
											<div class="flex items-center justify-between mb-1">
												<span class="text-xs text-gray-500">Options ({widget.config?.options?.length ?? 0})</span>
												<button type="button" onclick={() => addWidgetOption(pi, wi)} class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add</button>
											</div>
											{#each widget.config?.options ?? [] as option, oi}
												{@const optPath = [...widgetPath(pi, wi, 'config'), 'options', String(oi)]}
												<div class="flex items-start gap-2 mb-1">
													<input
														type="text"
														value={option.value}
														oninput={(e) => update([...optPath, 'value'], e.currentTarget.value)}
														class="w-24 shrink-0 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
														placeholder="value"
													/>
													<div class="flex-1">
														<LocalizedInput label="" value={option.label} {languages} onchange={(v) => update([...optPath, 'label'], v)} />
													</div>
													<button type="button" onclick={() => removeWidgetOption(pi, wi, oi)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer mt-1">×</button>
												</div>
											{/each}
										</div>
									{/if}

									<!-- Min/Max/Step config for slider and likert widgets -->
									{#if widget.type === 'slider' || widget.type === 'likert'}
										<div class="border-t border-gray-100 pt-2 mt-2">
											<span class="text-xs text-gray-500 block mb-1">Range config</span>
											<div class="grid grid-cols-3 gap-2">
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Min</label>
													<input
														type="number"
														value={widget.config?.min ?? (widget.type === 'likert' ? 1 : 0)}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'min'], e.currentTarget.valueAsNumber)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
													/>
												</div>
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Max</label>
													<input
														type="number"
														value={widget.config?.max ?? (widget.type === 'likert' ? 7 : 100)}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'max'], e.currentTarget.valueAsNumber)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
													/>
												</div>
												{#if widget.type === 'slider'}
													<div>
														<label class="block text-xs text-gray-400 mb-0.5">Step</label>
														<input
															type="number"
															value={widget.config?.step ?? 1}
															oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'step'], e.currentTarget.valueAsNumber)}
															class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
														/>
													</div>
												{/if}
											</div>
											<div class="grid grid-cols-2 gap-2 mt-2">
												<LocalizedInput label="Min label" value={widget.config?.minLabel ?? {}} {languages} onchange={(v) => update([...widgetPath(pi, wi, 'config'), 'minLabel'], v)} />
												<LocalizedInput label="Max label" value={widget.config?.maxLabel ?? {}} {languages} onchange={(v) => update([...widgetPath(pi, wi, 'config'), 'maxLabel'], v)} />
											</div>
										</div>
									{/if}

									<!-- Config for textarea -->
									{#if widget.type === 'textarea'}
										<div class="border-t border-gray-100 pt-2 mt-2 space-y-2">
											<span class="text-xs text-gray-500 block">Textarea config</span>
											<label class="flex items-center gap-2 text-xs">
												<input type="checkbox" checked={widget.config?.showCharCount ?? false}
													onchange={(e) => update([...widgetPath(pi, wi, 'config'), 'showCharCount'], e.currentTarget.checked)} />
												Show character count
											</label>
											<div class="grid grid-cols-2 gap-2">
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Min length</label>
													<input type="number" value={widget.config?.minLength ?? ''}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'minLength'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="—" />
												</div>
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Max length</label>
													<input type="number" value={widget.config?.maxLength ?? ''}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'maxLength'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="—" />
												</div>
											</div>
										</div>
									{/if}

									<!-- Config for number widget -->
									{#if widget.type === 'number'}
										<div class="border-t border-gray-100 pt-2 mt-2">
											<span class="text-xs text-gray-500 block mb-1">Number config</span>
											<div class="grid grid-cols-3 gap-2">
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Min</label>
													<input type="number" value={widget.config?.min ?? ''}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'min'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="—" />
												</div>
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Max</label>
													<input type="number" value={widget.config?.max ?? ''}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'max'], e.currentTarget.value ? e.currentTarget.valueAsNumber : undefined)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="—" />
												</div>
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Step</label>
													<input type="number" value={widget.config?.step ?? 1}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'step'], e.currentTarget.valueAsNumber)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
												</div>
											</div>
										</div>
									{/if}

									<!-- Config for timestamp-range widget -->
									{#if widget.type === 'timestamp-range'}
										<div class="border-t border-gray-100 pt-2 mt-2 grid grid-cols-2 gap-2">
											<LocalizedInput label="Start button label" value={widget.config?.captureStartLabel ?? {}} {languages} onchange={(v) => update([...widgetPath(pi, wi, 'config'), 'captureStartLabel'], v)} />
											<LocalizedInput label="End button label" value={widget.config?.captureEndLabel ?? {}} {languages} onchange={(v) => update([...widgetPath(pi, wi, 'config'), 'captureEndLabel'], v)} />
										</div>
									{/if}

									<!-- Config for audio-recording widget -->
									{#if widget.type === 'audio-recording'}
										<div class="border-t border-gray-100 pt-2 mt-2">
											<span class="text-xs text-gray-500 block mb-1">Recording config</span>
											<div class="grid grid-cols-2 gap-2">
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Max duration (seconds)</label>
													<input type="number" value={widget.config?.maxDurationSeconds ?? 120}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'maxDurationSeconds'], e.currentTarget.valueAsNumber)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
												</div>
												<div>
													<label class="block text-xs text-gray-400 mb-0.5">Max file size (MB)</label>
													<input type="number" value={widget.config?.maxFileSizeMB ?? 50}
														oninput={(e) => update([...widgetPath(pi, wi, 'config'), 'maxFileSizeMB'], e.currentTarget.valueAsNumber)}
														class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
												</div>
											</div>
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
							<!-- Optional: next-phase button label -->
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
							<!-- Optional: stay button label -->
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
					</div>
				</div>
			{/each}
		</div>
	</FormSection>

	<!-- Stimuli -->
	<FormSection title="Stimuli">
		<div class="space-y-4">
			<div class="grid grid-cols-3 gap-3">
				<div>
					<label class="block text-xs text-gray-500 mb-1">Type</label>
					<select
						value={config.stimuli.type}
						onchange={(e) => update(['stimuli', 'type'], e.currentTarget.value)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					>
						{#each stimulusTypes as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="block text-xs text-gray-500 mb-1">Source</label>
					<select
						value={config.stimuli.source}
						onchange={(e) => update(['stimuli', 'source'], e.currentTarget.value)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					>
						{#each sourceTypes as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="block text-xs text-gray-500 mb-1">Storage Path</label>
					<input
						type="text"
						value={config.stimuli.storagePath ?? ''}
						oninput={(e) => { update(['stimuli', 'storagePath'], e.currentTarget.value || undefined); storageCheck = { status: 'idle' }; }}
						class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
						placeholder="stimuli/experiment-name"
					/>
				</div>
			</div>

			{#if config.stimuli.source === 'supabase-storage' && config.stimuli.storagePath}
				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={checkStorage}
						disabled={storageCheck.status === 'loading'}
						class="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-600 cursor-pointer disabled:opacity-50"
					>
						{storageCheck.status === 'loading' ? 'Checking…' : 'Check storage'}
					</button>
					{#if storageCheck.status === 'ok'}
						{#if storageCheck.count === 0}
							<span class="text-xs text-amber-600">No files found at this path</span>
						{:else}
							<span class="text-xs text-green-700">{storageCheck.count} file{storageCheck.count === 1 ? '' : 's'} found</span>
							<span class="text-xs text-gray-400 font-mono truncate max-w-xs">{storageCheck.files.slice(0, 3).join(', ')}{storageCheck.count > 3 ? ` +${storageCheck.count - 3} more` : ''}</span>
						{/if}
					{:else if storageCheck.status === 'error'}
						<span class="text-xs text-red-600">{storageCheck.message}</span>
					{/if}
				</div>
			{/if}

			<div>
				<label class="block text-xs text-gray-500 mb-1">Message template <span class="text-gray-400 font-normal">(optional)</span></label>
				<input
					type="text"
					value={config.stimuli.messageTemplate ?? ''}
					oninput={(e) => update(['stimuli', 'messageTemplate'], e.currentTarget.value || undefined)}
					class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					placeholder="e.g. The emotion displayed is {'{metadata.emotion}'}."
				/>
				<p class="mt-1 text-xs text-gray-400">Shown below each stimulus. Use <code class="font-mono">{'{metadata.key}'}</code> for per-stimulus values.</p>
			</div>

			<!-- Shared metadata keys -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<label class="block text-xs text-gray-500">Metadata keys</label>
					<button
						type="button"
						onclick={() => {
							const keys = [...(config.stimuli.metadataKeys ?? [])];
							const newKey = `key${keys.length + 1}`;
							keys.push(newKey);
							update(['stimuli', 'metadataKeys'], keys);
							// Add empty value for this key on all items
							config.stimuli.items.forEach((_, idx) => {
								if (!config.stimuli.items[idx].metadata) update(['stimuli', 'items', String(idx), 'metadata'], {});
								update(['stimuli', 'items', String(idx), 'metadata', newKey], '');
							});
						}}
						class="text-xs text-indigo-500 hover:text-indigo-700 cursor-pointer"
					>+ Add key</button>
				</div>
				{#each (config.stimuli.metadataKeys ?? []) as metaKey, ki}
					<div class="flex items-center gap-1.5">
						<input
							type="text"
							value={metaKey}
							oninput={(e) => {
								const oldKey = metaKey;
								const newKey = e.currentTarget.value;
								const keys = [...(config.stimuli.metadataKeys ?? [])];
								keys[ki] = newKey;
								update(['stimuli', 'metadataKeys'], keys);
								// Rename key on all items
								config.stimuli.items.forEach((item, idx) => {
									const current = { ...(item.metadata ?? {}) };
									const val = current[oldKey];
									delete current[oldKey];
									current[newKey] = val ?? '';
									update(['stimuli', 'items', String(idx), 'metadata'], current);
								});
							}}
							class="w-36 px-1.5 py-0.5 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
							placeholder="key name"
						/>
						<button
							type="button"
							onclick={() => {
								const keys = (config.stimuli.metadataKeys ?? []).filter((_, i) => i !== ki);
								update(['stimuli', 'metadataKeys'], keys.length ? keys : undefined);
								// Remove key from all items
								config.stimuli.items.forEach((item, idx) => {
									if (!item.metadata) return;
									const current = { ...item.metadata };
									delete current[metaKey];
									update(['stimuli', 'items', String(idx), 'metadata'], Object.keys(current).length ? current : undefined);
								});
							}}
							class="text-xs text-red-400 hover:text-red-600 cursor-pointer px-1"
						>✕</button>
					</div>
				{/each}
				{#if !(config.stimuli.metadataKeys?.length)}
					<p class="text-xs text-gray-400 italic">No metadata keys defined.</p>
				{/if}
			</div>

			<div class="flex items-center justify-between">
				<h4 class="text-sm text-gray-500">Items ({config.stimuli.items.length})</h4>
				<button type="button" onclick={addStimulusItem} class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add Item</button>
			</div>

			{#each config.stimuli.items as item, i}
				<div class="border border-gray-200 rounded p-3 space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-mono text-gray-400">{item.id}</span>
						<div class="flex items-center gap-2">
							<button type="button" disabled={i === 0}
								onclick={() => { [config.stimuli.items[i-1], config.stimuli.items[i]] = [config.stimuli.items[i], config.stimuli.items[i-1]]; }}
								class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed">↑</button>
							<button type="button" disabled={i === config.stimuli.items.length - 1}
								onclick={() => { [config.stimuli.items[i], config.stimuli.items[i+1]] = [config.stimuli.items[i+1], config.stimuli.items[i]]; }}
								class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed">↓</button>
							<button type="button" onclick={() => removeStimulusItem(i)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
						</div>
					</div>
					<div class="grid grid-cols-3 gap-2">
						<div>
							<label class="block text-xs text-gray-500 mb-0.5">ID</label>
							<input
								type="text"
								value={item.id}
								oninput={(e) => update(['stimuli', 'items', String(i), 'id'], e.currentTarget.value)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div>
							<label class="block text-xs text-gray-500 mb-0.5">Filename</label>
							<input
								type="text"
								value={item.filename ?? ''}
								oninput={(e) => update(['stimuli', 'items', String(i), 'filename'], e.currentTarget.value || undefined)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div>
							<label class="block text-xs text-gray-500 mb-0.5">URL</label>
							<input
								type="text"
								value={item.url ?? ''}
								oninput={(e) => update(['stimuli', 'items', String(i), 'url'], e.currentTarget.value || undefined)}
								class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
					</div>
					<!-- Metadata values (keys defined above) -->
					{#if config.stimuli.metadataKeys?.length}
						<div class="space-y-1">
							{#each (config.stimuli.metadataKeys ?? []) as metaKey}
								<div class="flex items-center gap-1.5">
									<span class="w-24 text-xs font-mono text-gray-500 shrink-0">{metaKey}</span>
									<span class="text-gray-300 text-xs">:</span>
									<input
										type="text"
										value={String(item.metadata?.[metaKey] ?? '')}
										oninput={(e) => {
											if (!item.metadata) update(['stimuli', 'items', String(i), 'metadata'], {});
											update(['stimuli', 'items', String(i), 'metadata', metaKey], e.currentTarget.value);
										}}
										class="flex-1 px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
										placeholder="value"
									/>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</FormSection>

	<!-- Tutorial -->
	<FormSection title="Tutorial">
		{#if !config.tutorial}
			<div class="text-center py-4">
				<p class="text-sm text-gray-500 mb-3">No tutorial configured.</p>
				<button
					type="button"
					onclick={() => {
						config.tutorial = {
							welcome: {
								title: Object.fromEntries(languages.map((l) => [l, 'Tutorial'])),
								body: Object.fromEntries(languages.map((l) => [l, 'Let us walk you through the process.'])),
								buttonText: Object.fromEntries(languages.map((l) => [l, 'Begin']))
							},
							steps: [],
							completion: {
								title: Object.fromEntries(languages.map((l) => [l, 'Tutorial Complete'])),
								body: Object.fromEntries(languages.map((l) => [l, 'You are ready to begin.'])),
								buttonText: Object.fromEntries(languages.map((l) => [l, 'Start']))
							},
							sampleStimuliIds: []
						};
					}}
					class="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer"
				>
					Enable Tutorial
				</button>
			</div>
		{:else}
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<h4 class="text-sm font-medium text-gray-600">Welcome</h4>
					<button
						type="button"
						onclick={() => { config.tutorial = null; }}
						class="text-xs text-red-500 hover:text-red-700 cursor-pointer"
					>
						Disable Tutorial
					</button>
				</div>
				<LocalizedInput label="Title" value={config.tutorial.welcome.title} {languages} onchange={(v) => update(['tutorial', 'welcome', 'title'], v)} />
				<LocalizedInput label="Body" value={config.tutorial.welcome.body} {languages} multiline onchange={(v) => update(['tutorial', 'welcome', 'body'], v)} />
				<LocalizedInput label="Button Text" value={config.tutorial.welcome.buttonText} {languages} onchange={(v) => update(['tutorial', 'welcome', 'buttonText'], v)} />

				<h4 class="text-sm font-medium text-gray-600 pt-2">Steps ({config.tutorial.steps.length})</h4>
				{#each config.tutorial.steps as step, si}
					<div class="border border-gray-200 rounded p-3 space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-xs font-mono text-gray-400">Step {si + 1}: {step.id}</span>
							<button
								type="button"
								onclick={() => { config.tutorial!.steps.splice(si, 1); }}
								class="text-xs text-red-500 hover:text-red-700 cursor-pointer"
							>
								Remove
							</button>
						</div>
						<div class="grid grid-cols-3 gap-2">
							<div>
								<label class="block text-xs text-gray-500 mb-0.5">ID</label>
								<input type="text" value={step.id} oninput={(e) => update(['tutorial', 'steps', String(si), 'id'], e.currentTarget.value)}
									class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
							</div>
							<div>
								<label class="block text-xs text-gray-500 mb-0.5">Target Selector</label>
								<input type="text" value={step.targetSelector} oninput={(e) => update(['tutorial', 'steps', String(si), 'targetSelector'], e.currentTarget.value)}
									class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
							</div>
							<div>
								<label class="block text-xs text-gray-500 mb-0.5">Position</label>
								<select value={step.position} onchange={(e) => update(['tutorial', 'steps', String(si), 'position'], e.currentTarget.value)}
									class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
									{#each ['top', 'bottom', 'left', 'right', 'center'] as pos}
										<option value={pos}>{pos}</option>
									{/each}
								</select>
							</div>
						</div>
						<LocalizedInput label="Title" value={step.title} {languages} onchange={(v) => update(['tutorial', 'steps', String(si), 'title'], v)} />
						<LocalizedInput label="Body" value={step.body} {languages} multiline onchange={(v) => update(['tutorial', 'steps', String(si), 'body'], v)} />
					</div>
				{/each}
				<button
					type="button"
					onclick={() => {
						config.tutorial!.steps.push({
							id: `step_${Date.now()}`,
							targetSelector: '',
							title: Object.fromEntries(languages.map((l) => [l, ''])),
							body: Object.fromEntries(languages.map((l) => [l, ''])),
							position: 'bottom'
						});
					}}
					class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer"
				>
					+ Add Step
				</button>

				<h4 class="text-sm font-medium text-gray-600 pt-2">Completion</h4>
				<LocalizedInput label="Title" value={config.tutorial.completion.title} {languages} onchange={(v) => update(['tutorial', 'completion', 'title'], v)} />
				<LocalizedInput label="Body" value={config.tutorial.completion.body} {languages} multiline onchange={(v) => update(['tutorial', 'completion', 'body'], v)} />
				<LocalizedInput label="Button Text" value={config.tutorial.completion.buttonText} {languages} onchange={(v) => update(['tutorial', 'completion', 'buttonText'], v)} />
			</div>
		{/if}
	</FormSection>

	<!-- Completion -->
	<FormSection title="Completion">
		<div class="space-y-4">
			{#if config.completion}
				<LocalizedInput label="Title" value={config.completion.title} {languages} onchange={(v) => update(['completion', 'title'], v)} />
				<LocalizedInput label="Body" value={config.completion.body} {languages} multiline onchange={(v) => update(['completion', 'body'], v)} />
				<div>
					<label class="block text-xs text-gray-500 mb-1">Redirect URL (optional)</label>
					<input
						type="text"
						value={config.completion.redirectUrl ?? ''}
						oninput={(e) => update(['completion', 'redirectUrl'], e.currentTarget.value || undefined)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
						placeholder="https://example.com/thank-you"
					/>
				</div>
				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={config.completion.showSummary ?? false}
						onchange={(e) => update(['completion', 'showSummary'], e.currentTarget.checked)}
					/>
					Show response summary to participant on completion
				</label>
			{:else}
				<p class="text-sm text-gray-500">No completion config. Add one:</p>
				<button
					type="button"
					onclick={() => {
						config.completion = {
							title: Object.fromEntries(languages.map((l) => [l, 'Thank you!'])),
							body: Object.fromEntries(languages.map((l) => [l, 'You have completed the experiment.']))
						};
					}}
					class="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer"
				>
					Add Completion Config
				</button>
			{/if}
		</div>
	</FormSection>
</div>
