<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import { experiment } from '$lib/stores/experiment.svelte';
	import { participantStore } from '$lib/stores/participant.svelte';

	let { onLogout }: { onLogout?: () => void } = $props();

	let languages = $derived(experiment.supportedLanguages);
	let selectedLang = $state(i18n.language);

	function handleLanguageChange(e: Event) {
		const lang = (e.target as HTMLSelectElement).value;
		selectedLang = lang;
		i18n.setLanguage(lang);
	}

	let participantName = $derived(
		participantStore.current
			? (participantStore.current.registrationData?.name as string ?? participantStore.current.email)
			: null
	);
</script>

<header class="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
	<div class="flex items-center gap-4">
		{#if participantName}
			<span class="text-sm text-gray-600">
				{participantName}
			</span>
		{/if}
	</div>
	<div class="flex items-center gap-3">
		{#if languages.length > 1}
			<select
				id="language-selector"
				name="language"
				class="text-sm border border-gray-300 rounded px-2 py-1"
				value={selectedLang}
				onchange={handleLanguageChange}
			>
				{#each languages as lang}
					<option value={lang}>{lang.toUpperCase()}</option>
				{/each}
			</select>
		{/if}
		{#if participantStore.current}
			<button
				class="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
				onclick={() => onLogout?.()}
			>
				{i18n.platform('common.logout')}
			</button>
		{/if}
	</div>
</header>
