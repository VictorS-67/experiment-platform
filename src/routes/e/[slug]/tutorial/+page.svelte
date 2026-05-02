<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { experiment } from '$lib/stores/experiment.svelte';
	import { participantStore } from '$lib/stores/participant.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import ProgressBar from '$lib/components/layout/ProgressBar.svelte';
	import StimulusRenderer from '$lib/components/stimuli/StimulusRenderer.svelte';
	import WidgetRenderer from '$lib/components/widgets/WidgetRenderer.svelte';
	import TutorialOverlay from '$lib/components/tutorial/TutorialOverlay.svelte';
	import type { TutorialConfigType } from '$lib/config/schema';

	let { data } = $props();

	let signedUrls = $derived((data as Record<string, unknown>).signedUrls as Record<string, string> | undefined ?? {});
	let config = $derived(experiment.config);
	let slug = $derived($page.params.slug);
	let tutorial = $derived(config?.tutorial as TutorialConfigType | null);

	// Use sample stimuli or fall back to first stimulus
	let sampleItem = $derived.by(() => {
		if (!config?.stimuli?.items?.length) return null;
		const sampleIds = tutorial?.sampleStimuliIds ?? [];
		if (sampleIds.length > 0) {
			return config.stimuli.items.find(s => sampleIds.includes(s.id)) ?? config.stimuli.items[0];
		}
		return config.stimuli.items[0];
	});

	let firstPhase = $derived(config?.phases?.[0]);
	let activeWidgets = $derived(firstPhase?.responseWidgets ?? []);

	let mediaElement: HTMLMediaElement | undefined = $state(undefined);
	let widgetValues = $state<Record<string, string>>({});
	let showGatekeeper = $state(false);
	let showWidgets = $state(false);

	$effect(() => {
		// Reset visibility when firstPhase changes
		if (firstPhase?.gatekeeperQuestion) {
			showGatekeeper = true;
			showWidgets = false;
		} else {
			showGatekeeper = false;
			showWidgets = true;
		}
		// Reset widget values
		const defaults: Record<string, string> = {};
		for (const w of activeWidgets) {
			defaults[w.id] = '';
		}
		widgetValues = defaults;
	});

	// Initialize participant from server data
	$effect(() => {
		if (data.participant) {
			participantStore.current = {
				id: data.participant.id,
				experimentId: experiment.id!,
				email: data.participant.email,
				registrationData: data.participant.registrationData,
				registeredAt: data.participant.registeredAt
			};
		}
	});

	function handleTutorialComplete() {
		// Server resolves the first-chunk URL respecting per-participant
		// chunkOrder. For chunked experiments we MUST use that — no
		// `chunks[0]` fallback (would silently misroute non-zero rotations).
		// If the server didn't compute one in a chunked experiment (rare —
		// would indicate a server-side bug), bounce to the landing page so
		// the login flow re-resolves the destination.
		const phaseSlug = firstPhase?.slug ?? 'survey';
		const serverFirst = (data as { firstChunkUrl?: string | null }).firstChunkUrl;
		const chunking = config?.stimuli?.chunking;
		const isChunked = chunking?.enabled && (chunking.chunks?.length ?? 0) > 0;
		const destination = serverFirst
			?? (isChunked ? `/e/${slug}` : `/e/${slug}/${phaseSlug}`);
		goto(destination);
	}

	async function handleLogout() {
		await fetch(`/e/${slug}/auth`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'logout' })
		});
		participantStore.current = null;
		goto(`/e/${slug}`);
	}

	function handleGatekeeperYes() {
		showGatekeeper = false;
		showWidgets = true;
	}

	function handleGatekeeperNo() {
		// In tutorial mode, No just resets back to the gatekeeper state
		showGatekeeper = true;
		showWidgets = false;
	}

	function handleAudioReady(_widgetId: string, _blob: Blob | null) {
		// No-op in tutorial mode
	}
</script>

<svelte:head>
	<title>{config ? i18n.localized(config.metadata.title) : 'Tutorial'}</title>
</svelte:head>

<Header onLogout={handleLogout} />

<main class="container">
	{#if config && sampleItem && firstPhase}
		<!-- Simulated survey UI for tutorial context -->
		<p class="text-sm text-gray-500 mb-3">
			{participantStore.current?.registrationData?.name as string ?? participantStore.current?.email ?? ''}
		</p>

		<ProgressBar current={0} total={config.stimuli.items.length} />

		<div class="mt-4 mb-4">
			<StimulusRenderer
				item={sampleItem}
				config={config.stimuli}
				src={signedUrls[sampleItem.id] || undefined}
				bind:mediaElement
			/>
		</div>

		<!-- Gatekeeper question (if phase has one) -->
		{#if showGatekeeper && firstPhase.gatekeeperQuestion}
			<div class="mt-6 text-center">
				<p class="text-sm font-medium mb-4">
					{i18n.localized(firstPhase.gatekeeperQuestion.initial.text)}
				</p>
				<div class="flex gap-4 justify-center">
					<button
						type="button"
						id="gatekeeper-yes"
						class="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors cursor-pointer"
						onclick={handleGatekeeperYes}
					>
						{i18n.localized(firstPhase.gatekeeperQuestion.initial.yesLabel, i18n.platform('common.yes'))}
					</button>
					<button
						type="button"
						id="gatekeeper-no"
						class="px-6 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors cursor-pointer"
						onclick={handleGatekeeperNo}
					>
						{i18n.localized(firstPhase.gatekeeperQuestion.initial.noLabel, i18n.platform('common.no'))}
					</button>
				</div>
			</div>
		{/if}

		<!-- Response widgets -->
		{#if showWidgets}
			<div class="mt-6 space-y-2">
				{#each activeWidgets as widget (widget.id)}
					<WidgetRenderer
						{widget}
						value={widgetValues[widget.id] ?? ''}
						{mediaElement}
						onAudioReady={handleAudioReady}
					/>
				{/each}

				<button
					id="save-button"
					class="w-full mt-4 bg-indigo-600 text-white font-medium py-2 px-4 rounded hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
				>
					{i18n.platform('common.save')}
				</button>
			</div>
		{/if}
	{:else}
		<div class="flex justify-center items-center py-20">
			<div class="spinner w-8 h-8"></div>
		</div>
	{/if}
</main>

<!-- Tutorial overlay on top of everything -->
{#if tutorial}
	<TutorialOverlay config={tutorial} oncomplete={handleTutorialComplete} />
{/if}
