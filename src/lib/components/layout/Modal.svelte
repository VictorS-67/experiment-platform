<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		show = false,
		title = '',
		wide = false,
		onclose,
		children,
		footer
	}: {
		show: boolean;
		title?: string;
		/** Use a wider max-width — for content-rich modals like bulk import. */
		wide?: boolean;
		onclose?: () => void;
		children: Snippet;
		/** Optional sticky footer rendered outside the scrollable body. */
		footer?: Snippet;
	} = $props();

	let dialogEl: HTMLDivElement | undefined = $state(undefined);
	let previouslyFocused: HTMLElement | null = null;

	// Focus management:
	// - On open, remember whatever was focused, then move focus into the dialog.
	// - On close, return focus to the original element (a11y best practice so
	//   keyboard users land back where they were).
	$effect(() => {
		if (show && dialogEl) {
			previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
			// Defer to next tick so the dialog content is mounted.
			queueMicrotask(() => dialogEl?.focus());
			return () => {
				// Cleanup runs when `show` flips to false (or component unmounts).
				previouslyFocused?.focus?.();
				previouslyFocused = null;
			};
		}
	});

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && onclose) onclose();
	}

	// Focus trap: keep Tab/Shift-Tab cycling inside the dialog while it's open.
	function handleKeydown(e: KeyboardEvent) {
		if (!show) return;
		if (e.key === 'Escape' && onclose) {
			onclose();
			return;
		}
		if (e.key !== 'Tab' || !dialogEl) return;

		const focusables = dialogEl.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		if (e.shiftKey && active === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
	<!--
		The dialog container itself isn't interactive — the Escape handler is
		on svelte:window (keyboard users dismiss via Escape). Backdrop-click is
		mouse-only by design.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		bind:this={dialogEl}
		class="modal-overlay"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		onclick={handleBackdropClick}
		tabindex="-1"
	>
		<div class="modal-content" class:modal-wide={wide}>
			{#if title}
				<div class="px-8 pt-8 pb-4 shrink-0">
					<h2 class="text-xl font-semibold">{title}</h2>
				</div>
			{/if}
			<div class="flex-1 overflow-y-auto px-8 py-6">
				{@render children()}
			</div>
			{#if footer}
				<div class="shrink-0 border-t border-gray-200 px-8 py-4">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-wide {
		max-width: min(1100px, 95vw);
	}
</style>
