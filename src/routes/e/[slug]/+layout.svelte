<script lang="ts">
	import { experiment } from '$lib/stores/experiment.svelte';
	import { i18n } from '$lib/i18n/index.svelte';

	let { data, children } = $props();

	// Load experiment config into store
	$effect(() => {
		if (data.experiment) {
			experiment.config = data.experiment.config;
			experiment.id = data.experiment.id;
			i18n.setLanguage(data.experiment.config.metadata.defaultLanguage ?? 'en');
		}
	});
</script>

{@render children()}
