<script lang="ts">
	let {
		current = 0,
		total = 0
	}: {
		current: number;
		total: number;
	} = $props();

	let percentage = $derived(total > 0 ? Math.round((current / total) * 100) : 0);
</script>

<div class="w-full">
	<div class="flex justify-between text-sm text-gray-600 mb-1">
		<span>{current} / {total}</span>
		<span>{percentage}%</span>
	</div>
	<div class="w-full bg-gray-200 rounded-full h-2.5">
		<div
			class="bg-green-500 h-2.5 rounded-full transition-all duration-300 ease-out"
			style="width: {percentage}%"
		></div>
	</div>
</div>
