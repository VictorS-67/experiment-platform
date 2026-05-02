<script lang="ts">
	import type { ToastEntry } from '$lib/utils/toast.svelte';

	let { toast }: { toast: ToastEntry | null } = $props();
</script>

{#if toast}
	<div
		class="mb-4 p-3 rounded text-sm {toast.type === 'success'
			? 'bg-green-50 border border-green-200 text-green-700'
			: 'bg-red-50 border border-red-200 text-red-700'}"
	>
		<pre class="whitespace-pre-wrap font-sans m-0">{toast.message}</pre>
	</div>
{/if}
