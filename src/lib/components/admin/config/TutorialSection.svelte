<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import Field from './Field.svelte';
	import { updatePath } from './helpers';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages }: { config: ExperimentConfig; languages: string[] } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);

	const staticTutorialTargets = [
		{ selector: '#stimulus-player', label: 'Stimulus player' },
		{ selector: '#stimulus-nav', label: 'Stimulus navigation' },
		{ selector: '#gatekeeper-yes', label: 'Gatekeeper — Yes button' },
		{ selector: '#gatekeeper-no', label: 'Gatekeeper — No button' },
		{ selector: '#save-button', label: 'Save / Continue button' },
		{ selector: '#start-time-btn', label: 'Timestamp — Start button' },
		{ selector: '#end-time-btn', label: 'Timestamp — End button' },
	];

	let widgetTutorialTargets = $derived.by(() => {
		const targets: { selector: string; label: string }[] = [];
		for (const phase of config.phases) {
			const widgets = phase.type === 'review'
				? (phase.reviewConfig?.responseWidgets ?? [])
				: (phase.responseWidgets ?? []);
			for (const w of widgets) {
				const label = (w.label as Record<string, string>)?.en
					|| (w.label as Record<string, string>)?.ja
					|| w.id;
				targets.push({ selector: `#widget-${w.id}`, label: `Widget: ${label}` });
				targets.push({ selector: `#widget-input-${w.id}`, label: `Widget input: ${label}` });
			}
		}
		return targets;
	});

	function allTutorialSelectors() {
		return [...staticTutorialTargets, ...widgetTutorialTargets].map((t) => t.selector);
	}
</script>

{#if !config.tutorial}
	<div class="text-center py-4">
		<p class="text-sm text-gray-500 mb-3">No tutorial configured.</p>
		<button
			type="button"
			onclick={() => {
				config.tutorial = {
					allowSkip: true,
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
			<h4 class="text-sm font-medium text-gray-600">Tutorial</h4>
			<button
				type="button"
				onclick={() => { config.tutorial = null; }}
				class="text-xs text-red-500 hover:text-red-700 cursor-pointer"
			>
				Disable Tutorial
			</button>
		</div>

		<label class="flex items-center gap-2 cursor-pointer">
			<input
				type="checkbox"
				checked={config.tutorial.allowSkip !== false}
				onchange={(e) => update(['tutorial', 'allowSkip'], e.currentTarget.checked)}
				class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
			/>
			<span class="text-sm text-gray-700">Allow participants to skip the tutorial</span>
		</label>

		<div class="border border-gray-200 rounded p-3 space-y-3">
			<div class="flex items-center justify-between">
				<h4 class="text-sm font-medium text-gray-600">Introduction page</h4>
				{#if config.tutorial.introduction}
					<button type="button" onclick={() => update(['tutorial', 'introduction'], undefined)}
						class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
				{:else}
					<button type="button" onclick={() => update(['tutorial', 'introduction'], {
						title: Object.fromEntries(languages.map((l) => [l, 'About this study'])),
						body: Object.fromEntries(languages.map((l) => [l, 'In this study we are interested in...'])),
						buttonText: Object.fromEntries(languages.map((l) => [l, 'Continue']))
					})} class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 cursor-pointer">Add introduction page</button>
				{/if}
			</div>
			{#if config.tutorial.introduction}
				<LocalizedInput label="Title" value={config.tutorial.introduction.title} {languages} onchange={(v) => update(['tutorial', 'introduction', 'title'], v)} />
				<LocalizedInput label="Body" value={config.tutorial.introduction.body} {languages} multiline onchange={(v) => update(['tutorial', 'introduction', 'body'], v)} />
				<LocalizedInput label="Button Text (optional)" value={config.tutorial.introduction.buttonText ?? {}} {languages} onchange={(v) => update(['tutorial', 'introduction', 'buttonText'], Object.values(v).some(Boolean) ? v : undefined)} />
			{:else}
				<p class="text-xs text-gray-400">Optional — shown as a full-screen modal before the welcome screen.</p>
			{/if}
		</div>

		<h4 class="text-sm font-medium text-gray-600 pt-2">Welcome</h4>
		<LocalizedInput label="Title" value={config.tutorial.welcome.title} {languages} onchange={(v) => update(['tutorial', 'welcome', 'title'], v)} />
		<LocalizedInput label="Body" value={config.tutorial.welcome.body} {languages} multiline onchange={(v) => update(['tutorial', 'welcome', 'body'], v)} />
		<LocalizedInput label="Button Text" value={config.tutorial.welcome.buttonText} {languages} onchange={(v) => update(['tutorial', 'welcome', 'buttonText'], v)} />

		<h4 class="text-sm font-medium text-gray-600 pt-2">Steps ({config.tutorial.steps.length})</h4>
		{#each config.tutorial.steps as step, si}
			{@const isCustomTarget = !!step.targetSelector && !allTutorialSelectors().includes(step.targetSelector)}
			<div class="border border-gray-200 rounded p-3 space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-xs font-mono text-gray-400">Step {si + 1}: {step.id}</span>
					<button type="button" onclick={() => { config.tutorial!.steps.splice(si, 1); }}
						class="text-xs text-red-500 hover:text-red-700 cursor-pointer">Remove</button>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<Field label="ID">
						<input type="text" value={step.id} oninput={(e) => update(['tutorial', 'steps', String(si), 'id'], e.currentTarget.value)}
							class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
					</Field>
					<Field label="Position">
						<select value={step.position} onchange={(e) => update(['tutorial', 'steps', String(si), 'position'], e.currentTarget.value)}
							class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
							{#each ['top', 'bottom', 'left', 'right', 'center'] as pos}
								<option value={pos}>{pos}</option>
							{/each}
						</select>
					</Field>
				</div>

				<Field label="Target">
					<select
						value={isCustomTarget ? '__custom__' : (step.targetSelector || '')}
						onchange={(e) => {
							if (e.currentTarget.value !== '__custom__') {
								update(['tutorial', 'steps', String(si), 'targetSelector'], e.currentTarget.value);
							} else {
								update(['tutorial', 'steps', String(si), 'targetSelector'], '');
							}
						}}
						class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
					>
						<option value="">-- Select target --</option>
						<optgroup label="Page elements">
							{#each staticTutorialTargets as opt}
								<option value={opt.selector}>{opt.label} - {opt.selector}</option>
							{/each}
						</optgroup>
						{#if widgetTutorialTargets.length}
							<optgroup label="Widgets">
								{#each widgetTutorialTargets as opt}
									<option value={opt.selector}>{opt.label} - {opt.selector}</option>
								{/each}
							</optgroup>
						{/if}
						<option value="__custom__">Custom...</option>
					</select>
					{#if isCustomTarget}
						<input type="text" value={step.targetSelector}
							oninput={(e) => update(['tutorial', 'steps', String(si), 'targetSelector'], e.currentTarget.value)}
							aria-label="Custom target selector"
							placeholder="#my-element"
							class="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
					{/if}
				</Field>

				<div class="grid grid-cols-2 gap-2">
					<Field label="Require action">
						<select
							value={step.validation?.type ?? 'none'}
							onchange={(e) => {
								const t = e.currentTarget.value;
								if (t === 'none') {
									update(['tutorial', 'steps', String(si), 'validation'], undefined);
								} else {
									update(['tutorial', 'steps', String(si), 'validation'], { type: t, target: step.validation?.target });
								}
							}}
							class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
						>
							<option value="none">None — always clickable</option>
							<option value="click">Click — must click target</option>
							<option value="input">Input — must type in target</option>
							<option value="play">Play — must play media</option>
						</select>
					</Field>
					{#if step.validation && step.validation.type !== 'none'}
						<Field label="Validation target (optional)">
							<input type="text" value={step.validation.target ?? ''}
								oninput={(e) => update(['tutorial', 'steps', String(si), 'validation', 'target'], e.currentTarget.value || undefined)}
								placeholder={step.targetSelector || '#element'}
								class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
						</Field>
					{/if}
				</div>

				<LocalizedInput label="Title" value={step.title} {languages} onchange={(v) => update(['tutorial', 'steps', String(si), 'title'], v)} />
				<LocalizedInput label="Body" value={step.body} {languages} multiline onchange={(v) => update(['tutorial', 'steps', String(si), 'body'], v)} />
				<LocalizedInput label="Instruction (shown as hint, optional)" value={step.instruction ?? {}} {languages} onchange={(v) => update(['tutorial', 'steps', String(si), 'instruction'], Object.values(v).some(Boolean) ? v : undefined)} />
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

		<div class="border-t border-gray-100 pt-3 mt-3">
			<h4 class="text-sm font-medium text-gray-600 mb-2">Sample Stimuli for Tutorial</h4>
			<p class="text-xs text-gray-400 mb-2">Select which stimuli to use during the tutorial walkthrough.</p>
			{#if config.stimuli.items.length}
				<div class="max-h-40 overflow-y-auto space-y-1">
					{#each config.stimuli.items as stim}
						<label class="flex items-center gap-2 text-xs cursor-pointer">
							<input
								type="checkbox"
								checked={config.tutorial?.sampleStimuliIds?.includes(stim.id) ?? false}
								onchange={(e) => {
									const ids = [...(config.tutorial?.sampleStimuliIds ?? [])];
									if (e.currentTarget.checked) {
										ids.push(stim.id);
									} else {
										const idx = ids.indexOf(stim.id);
										if (idx >= 0) ids.splice(idx, 1);
									}
									update(['tutorial', 'sampleStimuliIds'], ids);
								}}
								class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
							/>
							<span class="font-mono text-gray-600">{stim.id}</span>
							{#if stim.filename}<span class="text-gray-400">- {stim.filename}</span>{/if}
						</label>
					{/each}
				</div>
			{:else}
				<p class="text-xs text-gray-400 italic">No stimuli defined yet.</p>
			{/if}
		</div>
	</div>
{/if}
