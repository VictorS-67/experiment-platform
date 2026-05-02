<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import Modal from '$lib/components/layout/Modal.svelte';

	type Props = {
		show: boolean;
		title: string;
		body?: string;
		bodyExtra?: Snippet;
		/** The exact phrase the user must type to enable the confirm button.
		 *  Intentionally a string (not localized) — typing "削除" is easier
		 *  than recognizing the danger of a destructive action. The phrase
		 *  is the safety mechanism. */
		confirmPhrase: string;
		confirmLabel: string;
		confirmingLabel: string;
		/** Tailwind color tokens for the confirm button. Defaults to red
		 *  (delete-style). Pass an `amber-...` palette for reset-style. */
		variant?: 'red' | 'amber';
		loading: boolean;
		formAction: string;
		formEnhance: import('@sveltejs/kit').SubmitFunction;
		onclose: () => void;
	};

	let {
		show,
		title,
		body,
		bodyExtra,
		confirmPhrase,
		confirmLabel,
		confirmingLabel,
		variant = 'red',
		loading,
		formAction,
		formEnhance,
		onclose
	}: Props = $props();

	let confirmText = $state('');
	const matches = $derived(confirmText === confirmPhrase);

	function reset() {
		confirmText = '';
	}

	function handleClose() {
		reset();
		onclose();
	}

	const ringClass = $derived(variant === 'amber' ? 'focus:ring-amber-500' : 'focus:ring-red-500');
	const btnClass = $derived(
		variant === 'amber'
			? 'border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
			: 'bg-red-600 text-white hover:bg-red-700'
	);
</script>

<Modal {show} {title} onclose={handleClose}>
	{#if body}
		<p class="text-sm text-gray-700 mb-4">{body} Type <strong>{confirmPhrase}</strong> to confirm.</p>
	{/if}
	{#if bodyExtra}{@render bodyExtra()}{/if}
	<input
		type="text"
		bind:value={confirmText}
		placeholder={confirmPhrase}
		aria-label="Confirmation phrase"
		class="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4 focus:outline-none {ringClass}"
	/>
	<form method="POST" action={formAction} use:enhance={formEnhance}>
		<div class="flex gap-2 justify-end">
			<button
				type="button"
				onclick={handleClose}
				class="text-sm px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 cursor-pointer"
			>Cancel</button>
			<button
				type="submit"
				disabled={!matches || loading}
				class="text-sm px-4 py-2 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed {btnClass}"
			>{loading ? confirmingLabel : confirmLabel}</button>
		</div>
	</form>
</Modal>

