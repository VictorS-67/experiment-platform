<script lang="ts">
	let {
		current = 0,
		total = 0,
		blockBoundaries = undefined
	}: {
		current: number;
		total: number;
		/** When provided, render thin vertical dividers between blocks so the
		 * participant can see where the next break-screen sits. Indices are
		 * 0-based stimulus positions within the chunk. */
		blockBoundaries?: Array<{ startIndex: number; endIndex: number }>;
	} = $props();

	let percentage = $derived(total > 0 ? Math.round((current / total) * 100) : 0);

	// Boundary positions as % of total. Skip the last block — its endIndex is
	// the chunk's end and a divider there is visual noise.
	let dividerPercents = $derived.by(() => {
		if (!blockBoundaries || total <= 0 || blockBoundaries.length <= 1) return [];
		return blockBoundaries
			.slice(0, -1)
			.map((b) => ((b.endIndex + 1) / total) * 100)
			.filter((p) => p > 0 && p < 100);
	});
</script>

<div class="w-full">
	<div class="flex justify-between text-sm text-gray-600 mb-1">
		<span>{current} / {total}</span>
		<span>{percentage}%</span>
	</div>
	<div class="relative w-full bg-gray-200 rounded-full h-3 overflow-hidden">
		<div
			class="bg-indigo-600 h-3 rounded-full transition-all duration-300 ease-out"
			style="width: {percentage}%"
		></div>
		{#each dividerPercents as p}
			<div
				class="absolute top-0 bottom-0 w-px bg-white/70"
				style="left: {p}%"
				aria-hidden="true"
			></div>
		{/each}
	</div>
</div>
