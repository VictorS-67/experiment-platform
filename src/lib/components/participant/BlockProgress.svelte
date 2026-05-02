<script lang="ts">
	import ProgressBar from '$lib/components/layout/ProgressBar.svelte';

	type BlockInfo = {
		blockIndex: number;
		totalBlocks: number;
		completed: number;
		total: number;
	} | null | undefined;

	type BlockBoundary = { blockId: string; startIndex: number; endIndex: number; label?: Record<string, string> };

	type Props = {
		completedCount: number;
		totalItems: number;
		blockBoundaries: BlockBoundary[] | undefined;
		currentBlockInfo: BlockInfo;
	};

	let { completedCount, totalItems, blockBoundaries, currentBlockInfo }: Props = $props();
</script>

<div class="flex items-center gap-3">
	<div class="flex-1"><ProgressBar current={completedCount} total={totalItems} {blockBoundaries} /></div>
	{#if currentBlockInfo}
		<span class="text-xs text-gray-500 whitespace-nowrap">
			Block {currentBlockInfo.blockIndex}/{currentBlockInfo.totalBlocks} — {currentBlockInfo.completed}/{currentBlockInfo.total}
		</span>
	{/if}
</div>
