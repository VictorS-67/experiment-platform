<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import { experiment } from '$lib/stores/experiment.svelte';
	import { participantStore } from '$lib/stores/participant.svelte';
	import Modal from './Modal.svelte';

	let { onLogout }: { onLogout?: () => void } = $props();

	let languages = $derived(experiment.supportedLanguages);
	let selectedLang = $state(i18n.language);
	let confirmLogout = $state(false);

	// Native names so participants see their own language in their own script,
	// not "ZH" or "JA". Falls back to the uppercase code for codes we haven't
	// mapped yet (rest of the LANGUAGE_CODES whitelist).
	const NATIVE_NAMES: Record<string, string> = {
		en: 'English',
		ja: '日本語',
		fr: 'Français',
		zh: '中文',
		es: 'Español',
		de: 'Deutsch',
		it: 'Italiano',
		pt: 'Português',
		ru: 'Русский',
		ko: '한국어',
		ar: 'العربية',
		hi: 'हिन्दी',
		tr: 'Türkçe',
		vi: 'Tiếng Việt',
		th: 'ไทย',
		id: 'Bahasa Indonesia',
		nl: 'Nederlands',
		pl: 'Polski',
		sv: 'Svenska',
		da: 'Dansk',
		no: 'Norsk',
		fi: 'Suomi'
	};
	function nativeName(code: string): string {
		return NATIVE_NAMES[code] ?? code.toUpperCase();
	}

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
					<option value={lang}>{nativeName(lang)}</option>
				{/each}
			</select>
		{/if}
		{#if participantStore.current}
			<button
				class="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
				onclick={() => { confirmLogout = true; }}
			>
				{i18n.platform('common.logout')}
			</button>
		{/if}
	</div>
</header>

<Modal
	show={confirmLogout}
	title={i18n.platform('common.logout_confirm_title')}
	onclose={() => { confirmLogout = false; }}
>
	<p class="text-gray-600 mb-4">{i18n.platform('common.logout_confirm_body')}</p>
	<div class="flex gap-3 justify-end">
		<button
			type="button"
			class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer"
			onclick={() => { confirmLogout = false; }}
		>
			{i18n.platform('common.cancel')}
		</button>
		<button
			type="button"
			class="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
			onclick={() => { confirmLogout = false; onLogout?.(); }}
		>
			{i18n.platform('common.logout')}
		</button>
	</div>
</Modal>
