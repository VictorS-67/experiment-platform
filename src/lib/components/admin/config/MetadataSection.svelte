<script lang="ts">
	import LocalizedInput from '../LocalizedInput.svelte';
	import Field from './Field.svelte';
	import { updatePath } from './helpers';
	import type { ExperimentConfig } from '$lib/config/schema';

	let { config, languages }: { config: ExperimentConfig; languages: string[] } = $props();

	const update = (path: string[], value: unknown) => updatePath(config, path, value);
</script>

<div class="space-y-4">
	<div class="grid grid-cols-2 gap-4">
		<Field label="Slug">
			<input
				type="text"
				value={config.slug}
				oninput={(e) => update(['slug'], e.currentTarget.value)}
				class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
			/>
		</Field>
		<Field label="Default Language">
			<select
				value={config.metadata.defaultLanguage}
				onchange={(e) => update(['metadata', 'defaultLanguage'], e.currentTarget.value)}
				class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
			>
				{#each languages as lang}
					<option value={lang}>{lang.toUpperCase()}</option>
				{/each}
			</select>
		</Field>
	</div>

	<Field label="Languages" help="Comma-separated language codes">
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
	</Field>

	<LocalizedInput label="Title" value={config.metadata.title} {languages} onchange={(v) => update(['metadata', 'title'], v)} />
	<LocalizedInput label="Description" value={config.metadata.description ?? {}} {languages} multiline onchange={(v) => update(['metadata', 'description'], v)} />
</div>
