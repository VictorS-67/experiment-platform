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

	// `signedUrls` and `firstChunkUrl` are streamed (returned as un-awaited
	// promises by the page-server load). On slow internet that lets the
	// tutorial intro modal render immediately while the sample-video URL and
	// chunk routing settle in the background. Hold the resolved values in
	// $state and resolve them with $effect.
	let { data } = $props();
	let signedUrls = $state<Record<string, string>>({});
	$effect(() => {
		const promise = data.signedUrls as Promise<Record<string, string>> | Record<string, string> | undefined;
		if (!promise) return;
		Promise.resolve(promise).then((v) => { signedUrls = v ?? {}; });
	});

	let config = $derived(experiment.config);
	let slug = $derived($page.params.slug);
	// Read the tutorial config from server data (rendered into SSR HTML),
	// NOT from the client-only `experiment` store (populated via `$effect`
	// after hydration). Without this, on Slow 3G the participant stares at an
	// empty page until the JS bundle finishes downloading, then the modal
	// suddenly appears post-hydration. With this, the intro modal markup is
	// in the initial HTML response and shows up as soon as render-blocking
	// CSS arrives.
	let tutorial = $derived(data.experiment?.config?.tutorial as TutorialConfigType | null);

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

	// Same marker derivation as the phase page so the tutorial's sample
	// stimulus shows captured start/end positions on the scrubber too.
	let scrubberMarkers = $derived.by(() => {
		const out: Array<{ at: number; label?: string; color?: string }> = [];
		for (const w of activeWidgets) {
			if (w.type !== 'timestamp-range') continue;
			const raw = widgetValues[w.id] ?? '';
			const [s, e] = raw.split(',').map((v) => parseFloat(v));
			if (Number.isFinite(s)) out.push({ at: s, label: 'start' });
			if (Number.isFinite(e)) out.push({ at: e, label: 'end' });
		}
		return out;
	});

	// Tutorial → first phase transition state. On poor internet, the destination
	// page-load (signed URLs, chunk routing) can stall the navigation. Without
	// surfacing this, the participant sees nothing happen after "Finish" and
	// concludes the tutorial is broken (real bug report from testing). The
	// overlay shows progress; if the navigation takes >10 s or rejects, a Retry
	// button is shown so they aren't stranded.
	let navigating = $state(false);
	let navTimedOut = $state(false);
	let navTimer: ReturnType<typeof setTimeout> | undefined;

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

	async function resolveDestination(): Promise<string> {
		// Server resolves the first-chunk URL respecting per-participant
		// chunkOrder. For chunked experiments we MUST use that — no
		// `chunks[0]` fallback (would silently misroute non-zero rotations).
		// `firstChunkUrl` is streamed; await the promise (will be near-instant
		// once it has resolved, but blocks if the participant clicks Finish
		// before the server computed it on a slow connection).
		const phaseSlug = firstPhase?.slug ?? 'survey';
		const promised = (data as { firstChunkUrl?: Promise<string | null> | string | null }).firstChunkUrl;
		const serverFirst = await Promise.resolve(promised ?? null);
		const chunking = config?.stimuli?.chunking;
		const isChunked = chunking?.enabled && (chunking.chunks?.length ?? 0) > 0;
		return serverFirst ?? (isChunked ? `/e/${slug}` : `/e/${slug}/${phaseSlug}`);
	}

	async function handleTutorialComplete() {
		navigating = true;
		navTimedOut = false;
		if (navTimer) clearTimeout(navTimer);
		navTimer = setTimeout(() => { navTimedOut = true; }, 10_000);
		try {
			const destination = await resolveDestination();
			await goto(destination);
		} catch (err) {
			console.error('Tutorial → first phase navigation failed:', err);
			navTimedOut = true;
		} finally {
			if (navTimer) { clearTimeout(navTimer); navTimer = undefined; }
		}
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
				markers={scrubberMarkers}
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

<!-- Loading curtain shown while we navigate from the tutorial to the first
     phase. On poor internet the destination's load (signed URLs + chunk
     resolution) can take many seconds; without a visible state the participant
     thought the tutorial was broken. After 10 s we surface a Retry button. -->
{#if navigating}
	<div
		class="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-center"
		role="status"
		aria-live="polite"
	>
		<div class="bg-white rounded-lg p-8 max-w-sm text-center shadow-xl">
			<div class="spinner w-10 h-10 mx-auto mb-4"></div>
			<p class="text-gray-800 font-medium">{i18n.platform('common.loading')}</p>
			{#if navTimedOut}
				<p class="text-sm text-gray-500 mt-3">
					This is taking longer than usual.
				</p>
				<button
					type="button"
					onclick={handleTutorialComplete}
					class="mt-4 px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors cursor-pointer"
				>
					{i18n.platform('common.try_again')}
				</button>
			{/if}
		</div>
	</div>
{/if}
