<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';

	type GatePrompt = {
		text: Record<string, string>;
		yesLabel: Record<string, string>;
		noLabel: Record<string, string>;
	};

	type Props = {
		prompt: GatePrompt;
		clicked: 'yes' | 'no' | null;
		saving: boolean;
		onYes: () => void;
		onNo: () => void;
	};

	let { prompt, clicked, saving, onYes, onNo }: Props = $props();
</script>

<div class="mt-6 text-center">
	<p class="text-sm font-medium mb-4">
		{i18n.localized(prompt.text)}
	</p>
	<div class="flex gap-4 justify-center">
		<button
			id="gatekeeper-yes"
			class="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors cursor-pointer disabled:opacity-60"
			onclick={onYes}
			disabled={saving || clicked !== null}
		>
			{clicked === 'yes' ? '…' : i18n.localized(prompt.yesLabel, i18n.platform('common.yes'))}
		</button>
		<button
			id="gatekeeper-no"
			class="px-6 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors cursor-pointer disabled:opacity-60"
			onclick={onNo}
			disabled={saving || clicked !== null}
		>
			{clicked === 'no' ? '…' : i18n.localized(prompt.noLabel, i18n.platform('common.no'))}
		</button>
	</div>
</div>
