<script lang="ts">
	import FormInput from './FormInput.svelte';

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
			<div class="flex-1">
				<FormInput
					value={value[lang] ?? ''}
					{multiline}
					rows={2}
					aria-label={label ? `${label} (${lang})` : lang}
					oninput={(v) => update(lang, v)}
				/>
			</div>
		</div>
	{/each}
</fieldset>
