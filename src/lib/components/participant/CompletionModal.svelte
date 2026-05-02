<script lang="ts" module>
	import type { PhaseConfigType } from '$lib/config/schema';

	// Discriminated union for the 4 completion variants. Exported so the
	// phase page can derive a CompletionState directly. Re-exporting the type
	// (not just the component) keeps the contract co-located.
	export type CompletionState =
		| { kind: 'next-phase'; phase: PhaseConfigType; customLabel: Record<string, string> | null }
		| { kind: 'next-chunk-cooldown'; remainingSecs: number }
		| { kind: 'next-chunk-ready'; url: string }
		| { kind: 'finish'; customLabel: Record<string, string> | null };
</script>

<script lang="ts">
	import Modal from '$lib/components/layout/Modal.svelte';
	import { i18n } from '$lib/i18n/index.svelte';

	type Props = {
		show: boolean;
		state: CompletionState;
		copy: { title: string; body: string };
		allowStay: boolean;
		stayLabel: Record<string, string> | null;
		// `onContinue` fires for next-phase AND next-chunk-ready. The parent
		// inspects `state.kind` to decide which navigation to perform — keeping
		// `goto`/`window.location.href` calls in the page (which is already a
		// SvelteKit page), not in this leaf component.
		onContinue: () => void;
		onFinish: () => void;
		onStay: () => void;
		onClose: () => void;
	};

	let { show, state, copy, allowStay, stayLabel, onContinue, onFinish, onStay, onClose }: Props = $props();
</script>

<Modal {show} title={copy.title} onclose={onClose}>
	<p class="text-gray-600 mb-4">{copy.body}</p>
	<div class="flex gap-3">
		{#if state.kind === 'next-phase'}
			<button
				type="button"
				class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer"
				onclick={onContinue}
			>
				{state.customLabel ? i18n.localized(state.customLabel) : i18n.platform('survey.next_phase')}
			</button>
		{:else if state.kind === 'next-chunk-cooldown'}
			{@const m = Math.floor(state.remainingSecs / 60)}
			{@const s = state.remainingSecs % 60}
			<button
				type="button"
				disabled
				class="flex-1 bg-indigo-300 text-white py-2 px-4 rounded cursor-not-allowed select-none"
			>
				{i18n.platform('survey.session_complete_resume_in', { time: m > 0 ? `${m}m ${s}s` : `${s}s` })}
			</button>
		{:else if state.kind === 'next-chunk-ready'}
			<button
				type="button"
				class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer"
				onclick={onContinue}
			>
				{i18n.platform('survey.start_next_chunk')} →
			</button>
		{:else}
			<button
				type="button"
				class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer"
				onclick={onFinish}
			>
				{state.customLabel ? i18n.localized(state.customLabel) : i18n.platform('survey.finish_experiment')}
			</button>
		{/if}
		{#if allowStay}
			<button
				type="button"
				class="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 cursor-pointer"
				onclick={onStay}
			>
				{stayLabel ? i18n.localized(stayLabel) : i18n.platform('survey.stay_on_page')}
			</button>
		{/if}
	</div>
</Modal>
