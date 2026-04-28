<script lang="ts">
	import { experiment } from '$lib/stores/experiment.svelte';
	import { i18n } from '$lib/i18n/index.svelte';

	let { data, children } = $props();

	// Load experiment config into store. Resolve the active language as
	// "participant's persisted choice (if any) ∩ supported languages, else
	// the experiment's defaultLanguage". Without the localStorage check, a
	// reload silently undoes the participant's selection on every nav.
	$effect(() => {
		if (data.experiment) {
			experiment.config = data.experiment.config;
			experiment.id = data.experiment.id;
			const defaultLang = data.experiment.config.metadata.defaultLanguage ?? 'en';
			const supported: string[] = data.experiment.config.metadata.languages ?? [
				defaultLang
			];
			const stored =
				typeof localStorage !== 'undefined'
					? localStorage.getItem('experiment-platform.language')
					: null;
			const lang = stored && supported.includes(stored) ? stored : defaultLang;
			i18n.setLanguage(lang);
		}
	});
</script>

{@render children()}
