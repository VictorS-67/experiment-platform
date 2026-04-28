<script lang="ts">
	import '../app.css';
	import { i18n } from '$lib/i18n/index.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	// Apply the persisted language on first mount so:
	//   1. The right translation file is loaded into i18n.translations.
	//   2. <html lang> reflects the participant's choice (a11y / SEO).
	onMount(() => {
		i18n.setLanguage(i18n.language);
	});
</script>

{@render children()}
