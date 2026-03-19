<script lang="ts">
	import FormSection from './FormSection.svelte';
	import LocalizedInput from './LocalizedInput.svelte';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config }: { config: ExperimentConfig } = $props();

	let languages = $derived(config.metadata?.languages ?? ['en']);

	// Direct mutation helpers — no clone/onchange needed because config IS the parent's $state proxy
	function update(path: string[], value: unknown) {
		let target: Record<string, unknown> = config as Record<string, unknown>;
		for (let i = 0; i < path.length - 1; i++) {
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
				config.phases[phaseIndex].reviewConfig = { sourcePhase: '', filterEmpty: true, responseWidgets: [] };
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
									onchange={(e) => update(['phases', String(pi), 'type'], e.currentTarget.value)}
									class="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
								>
									{#each phaseTypes as t}
										<option value={t}>{t}</option>
									{/each}
								</select>
							</div>
						</div>

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

						<LocalizedInput label="Title" value={phase.title} {languages} onchange={(v) => update(['phases', String(pi), 'title'], v)} />

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
													config.phases[pi].reviewConfig = { sourcePhase: '', filterEmpty: true, responseWidgets: [] };
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
													config.phases[pi].reviewConfig = { sourcePhase: '', filterEmpty: true, responseWidgets: [] };
												}
												config.phases[pi].reviewConfig!.filterEmpty = e.currentTarget.checked;
											}}
										/>
										Filter Empty
									</label>
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
						oninput={(e) => update(['stimuli', 'storagePath'], e.currentTarget.value || undefined)}
						class="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
						placeholder="experiment-name/"
					/>
				</div>
			</div>

			<div class="flex items-center justify-between">
				<h4 class="text-sm text-gray-500">Items ({config.stimuli.items.length})</h4>
				<button type="button" onclick={addStimulusItem} class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">+ Add Item</button>
			</div>

			{#each config.stimuli.items as item, i}
				<div class="border border-gray-200 rounded p-3 space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-mono text-gray-400">{item.id}</span>
						<button type="button" onclick={() => removeStimulusItem(i)} class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
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
