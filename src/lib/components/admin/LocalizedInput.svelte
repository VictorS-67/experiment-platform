<script lang="ts">
	let {
		label,
		value = {},
		languages = ['en'],
		multiline = false,
		onchange
	}: {
		label: string;
		value: Record<string, string>;
		languages: string[];
		multiline?: boolean;
		onchange: (val: Record<string, string>) => void;
	} = $props();

	function update(lang: string, text: string) {
		onchange({ ...value, [lang]: text });
	}
</script>

<fieldset>
	{#if label}
		<legend class="block text-sm font-medium text-gray-700 mb-1">{label}</legend>
	{/if}
	{#each languages as lang}
		<div class="flex items-start gap-2 mb-1.5">
			<span class="text-xs text-gray-400 mt-2 w-6 text-right uppercase font-mono" aria-hidden="true">{lang}</span>
			{#if multiline}
				<textarea
					value={value[lang] ?? ''}
					oninput={(e) => update(lang, e.currentTarget.value)}
					aria-label={label ? `${label} (${lang})` : lang}
					rows="2"
					class="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
				></textarea>
			{:else}
				<input
					type="text"
					value={value[lang] ?? ''}
					oninput={(e) => update(lang, e.currentTarget.value)}
					aria-label={label ? `${label} (${lang})` : lang}
					class="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
				/>
			{/if}
		</div>
	{/each}
</fieldset>
