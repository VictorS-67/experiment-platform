<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import { updatePath } from './helpers';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages }: { config: ExperimentConfig; languages: string[] } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);
</script>

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
