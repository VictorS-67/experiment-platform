<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		show = false,
		title = '',
		onclose,
		children
	}: {
		show: boolean;
		title?: string;
		onclose?: () => void;
		children: Snippet;
	} = $props();

	let dialogEl: HTMLDivElement | undefined = $state(undefined);

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && onclose) {
			onclose();
		}
	}

	// Focus the dialog when it opens
	$effect(() => {
		if (show && dialogEl) {
			dialogEl.focus();
		}
	});
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && show && onclose) onclose(); }} />

{#if show}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={dialogEl}
		class="modal-overlay"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		onclick={handleBackdropClick}
		tabindex="-1"
	>
		<div class="modal-content">
			{#if title}
				<h2 class="text-xl font-semibold mb-4">{title}</h2>
			{/if}
			{@render children()}
		</div>
	</div>
{/if}
