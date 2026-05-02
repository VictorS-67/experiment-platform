<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import Modal from '$lib/components/layout/Modal.svelte';

	type BreakScreen = {
		title?: Record<string, string>;
		body?: Record<string, string>;
		duration?: number;
		disabled?: boolean;
	} | null | undefined;

	type Props = {
		show: boolean;
		breakScreen: BreakScreen;
		countdown: number;
		ondismiss: () => void;
	};

	let { show, breakScreen, countdown, ondismiss }: Props = $props();

	const title = $derived(
		breakScreen?.title ? i18n.localized(breakScreen.title) : i18n.platform('survey.break_default_title')
	);
	const body = $derived(
		breakScreen?.body ? i18n.localized(breakScreen.body) : i18n.platform('survey.break_default_body')
	);
</script>

<Modal {show} {title} onclose={ondismiss}>
	<p class="text-gray-600 mb-4">{body}</p>
	<button
		class="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
		onclick={ondismiss}
		disabled={countdown > 0}
	>
		{countdown > 0 ? `${i18n.platform('common.continue')} (${countdown}s)` : i18n.platform('common.continue')}
	</button>
</Modal>
