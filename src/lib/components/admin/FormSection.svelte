<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		open = false,
		children
	}: {
		title: string;
		open?: boolean;
		children: Snippet;
	} = $props();

	// Capture `open` as the initial expanded value only — subsequent changes
	// to the `open` prop (not expected in practice) should not override the
	// user's manual toggle state.
	// svelte-ignore state_referenced_locally
	let expanded = $state(open);
</script>

<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
	<button
		type="button"
		class="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
		onclick={() => (expanded = !expanded)}
	>
		<h3 class="text-base font-medium text-gray-800">{title}</h3>
		<svg
			width="20"
			height="20"
			style="transform: rotate({expanded ? 180 : 0}deg); transition: transform 0.2s; color: #9ca3af; flex-shrink: 0;"
			fill="none" stroke="currentColor" viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>
	{#if expanded}
		<div class="px-6 pb-6 border-t border-gray-100 pt-4">
			{@render children()}
		</div>
	{/if}
</div>
