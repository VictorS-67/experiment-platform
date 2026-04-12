<script lang="ts">
	/**
	 * Chunked phase page — renders the exact same UI as the non-chunked phase page.
	 * The +page.server.ts computes orderedStimulusIds based on chunk/block config
	 * and latin square assignment. The phase page component reads data.orderedStimulusIds
	 * and uses it to filter/order stimuli.
	 */
	import PhasePage from '../../../[phaseSlug]/+page.svelte';

	let { data } = $props();
</script>

<PhasePage {data} />
