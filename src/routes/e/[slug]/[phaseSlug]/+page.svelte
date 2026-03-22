<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { experiment } from '$lib/stores/experiment.svelte';
	import { participantStore } from '$lib/stores/participant.svelte';
	import { responseStore } from '$lib/stores/responses.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { seededShuffle } from '$lib/utils';
	import Header from '$lib/components/layout/Header.svelte';
	import ProgressBar from '$lib/components/layout/ProgressBar.svelte';
	import StimulusNav from '$lib/components/layout/StimulusNav.svelte';
	import Modal from '$lib/components/layout/Modal.svelte';
	import StimulusRenderer from '$lib/components/stimuli/StimulusRenderer.svelte';
	import WidgetRenderer from '$lib/components/widgets/WidgetRenderer.svelte';
	import ReviewItemDisplay from '$lib/components/review/ReviewItemDisplay.svelte';
	import type { StimulusItemType, PhaseConfigType, ResponseWidgetType } from '$lib/config/schema';
	import type { ResponseRecord } from '$lib/services/data';

	let { data } = $props();

	let config = $derived(experiment.config);
	let slug = $derived($page.params.slug);
	let phase = $derived(data.phase as PhaseConfigType);
	let isReviewPhase = $derived(phase?.type === 'review');
	let phaseSlug = $derived(phase?.slug ?? '');

	// Active widgets: review uses reviewConfig.responseWidgets, stimulus-response uses phase.responseWidgets
	let activeWidgets: ResponseWidgetType[] = $derived(
		isReviewPhase && phase?.reviewConfig
			? phase.reviewConfig.responseWidgets
			: phase?.responseWidgets ?? []
	);

	// Items to navigate: stimuli items for stimulus-response, filtered source responses for review
	// Applies stimulus ordering (sequential, random, random-per-participant)
	let items = $derived.by(() => {
		if (isReviewPhase && data.sourceResponses) {
			let filtered = data.sourceResponses as ResponseRecord[];
			if (phase?.reviewConfig?.filterEmpty) {
				filtered = filtered.filter(r => {
					const entries = Object.entries(r.response_data).filter(([k]) => k !== '_timestamp');
					return entries.length > 0 && !entries.every(([, v]) => v === null || v === 'null');
				});
			}
			return filtered;
		}
		const rawItems = config?.stimuli?.items ?? [];
		const order = phase?.stimulusOrder ?? 'sequential';
		if (order === 'random') {
			return [...rawItems].sort(() => Math.random() - 0.5);
		}
		if (order === 'random-per-participant' && participantStore.current?.id) {
			return seededShuffle(rawItems, participantStore.current.id + (phase?.id ?? ''));
		}
		return rawItems;
	});

	// Current item (either a StimulusItemType or a ResponseRecord depending on phase type)
	let currentItem = $derived(items[responseStore.currentIndex] ?? null);

	// For review: resolve the stimulus that this source response is about
	let currentStimulusItem = $derived.by(() => {
		if (isReviewPhase && currentItem) {
			const sourceResp = currentItem as ResponseRecord;
			return config?.stimuli?.items?.find(s => s.id === sourceResp.stimulus_id);
		}
		return currentItem as StimulusItemType | null;
	});

	// Current item ID: for stimulus-response it's the stimulus id, for review it's the source response's UUID
	let currentItemId = $derived.by(() => {
		if (!currentItem) return '';
		if (isReviewPhase) return (currentItem as ResponseRecord).id;
		return (currentItem as StimulusItemType).id;
	});

	let mediaElement: HTMLMediaElement | undefined = $state(undefined);
	let widgetValues = $state<Record<string, string>>({});
	let audioBlobs = $state<Record<string, Blob>>({});
	let showGatekeeper = $state(true);
	let showWidgets = $state(false);
	let saving = $state(false);
	let responsesLoaded = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let showCompletionModal = $state(false);
	let completionModalShown = $state(false);

	// Reset all state when phase changes (e.g. navigating from one phase to the next)
	$effect(() => {
		// Access phaseSlug to track changes — this effect re-runs on every phase navigation
		phaseSlug;
		showCompletionModal = false;
		completionModalShown = false;
		responsesLoaded = false;
		responseStore.currentIndex = 0;
		widgetValues = {};
		audioBlobs = {};
		message = null;
		showGatekeeper = true;
		showWidgets = false;
	});

	// Initialize from server-loaded data
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

	$effect(() => {
		if (data.responses) {
			responseStore.list = data.responses;
			responseStore.currentPhaseId = phase?.id ?? '';
			responsesLoaded = true;
		}
	});

	// Reset widgets when item changes, but only after responses are loaded
	$effect(() => {
		if (currentItem && responsesLoaded) {
			resetForCurrentItem();
		}
	});

	function resetForCurrentItem() {
		const defaults: Record<string, string> = {};
		for (const w of activeWidgets) {
			// Sliders initialize to their min value so position matches logical state
			defaults[w.id] = w.type === 'slider' ? String(w.config?.min ?? 0) : '';
		}
		widgetValues = defaults;
		audioBlobs = {};
		message = null;

		const existing = responseStore.byStimulus.get(currentItemId);
		const hasExistingResponses = existing && existing.length > 0;

		if (isReviewPhase) {
			// Review phase: no gatekeeper, show widgets directly unless already responded
			if (hasExistingResponses) {
				showGatekeeper = false;
				showWidgets = false;
			} else {
				showGatekeeper = false;
				showWidgets = true;
			}
		} else if (phase?.gatekeeperQuestion) {
			if (hasExistingResponses && !phase.allowMultipleResponses) {
				showGatekeeper = false;
				showWidgets = false;
			} else {
				showGatekeeper = true;
				showWidgets = false;
			}
		} else {
			showGatekeeper = false;
			// If multiple responses are disabled and this item already has a response, hide widgets
			showWidgets = !(hasExistingResponses && !phase?.allowMultipleResponses);
		}

		checkCompletion();
	}

	function handleYes() {
		showGatekeeper = false;
		showWidgets = true;
	}

	function handleAudioReady(widgetId: string, blob: Blob | null) {
		if (blob) {
			audioBlobs = { ...audioBlobs, [widgetId]: blob };
		} else {
			const updated = { ...audioBlobs };
			delete updated[widgetId];
			audioBlobs = updated;
		}
	}

	async function handleNo() {
		if (!phase || !currentItem) return;

		saving = true;
		try {
			const responseData: Record<string, unknown> = {};
			for (const w of activeWidgets) {
				responseData[w.id] = phase.gatekeeperQuestion?.noResponseValue ?? 'null';
			}

			const res = await fetch(`/e/${slug}/${phaseSlug}/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phaseId: phase.id,
					stimulusId: currentItemId,
					responseData,
					responseIndex: getNextResponseIndex()
				})
			});

			if (!res.ok) throw new Error('Failed to save');
			const saved = await res.json();
			responseStore.list = [...responseStore.list, saved];

			advanceToNext();
		} catch (err) {
			message = { type: 'error', text: i18n.platform('survey.save_error') };
			console.error(err);
		} finally {
			saving = false;
		}
	}

	async function handleSave() {
		if (!phase || !currentItem) return;

		// Validate required widgets
		for (const w of activeWidgets) {
			if (!w.required) continue;
			if (w.type === 'timestamp-range') {
				const [start, end] = (widgetValues[w.id] || '').split(',');
				if (!start || !end) {
					message = { type: 'error', text: i18n.platform('survey.fill_in_required', { field: i18n.localized(w.label, w.id) }) };
					return;
				}
			} else if (!String(widgetValues[w.id] ?? '').trim()) {
				message = { type: 'error', text: i18n.platform('survey.fill_in_required', { field: i18n.localized(w.label, w.id) }) };
				return;
			}
		}

		saving = true;
		message = null;

		try {
			const responseData: Record<string, unknown> = {};

			// Upload any audio blobs first
			for (const w of activeWidgets) {
				if (w.type === 'audio-recording' && audioBlobs[w.id]) {
					const blob = audioBlobs[w.id];
					const formData = new FormData();
					formData.append('file', blob);
					formData.append('widgetId', w.id);
					formData.append('stimulusId', currentItemId);

					const uploadRes = await fetch(`/e/${slug}/${phaseSlug}/upload`, {
						method: 'POST',
						body: formData
					});

					if (!uploadRes.ok) throw new Error('Failed to upload audio');
					const { path } = await uploadRes.json();
					responseData[w.id] = path;
				}
			}

			for (const w of activeWidgets) {
				if (w.type === 'audio-recording') {
					if (!audioBlobs[w.id] && !(responseData[w.id])) {
						responseData[w.id] = null;
					}
				} else if (w.type === 'timestamp-range') {
					const [start, end] = (widgetValues[w.id] || '').split(',');
					responseData[w.id] = (start && end) ? `${start}-${end}` : null;
				} else {
					const v = widgetValues[w.id];
					responseData[w.id] = (v != null && v !== '') ? String(v) : null;
				}
			}
			const res = await fetch(`/e/${slug}/${phaseSlug}/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phaseId: phase.id,
					stimulusId: currentItemId,
					responseData,
					responseIndex: getNextResponseIndex()
				})
			});

			if (!res.ok) throw new Error('Failed to save');
			const saved = await res.json();
			responseStore.list = [...responseStore.list, saved];

			message = { type: 'success', text: i18n.platform('survey.save_success') };

			if (!isReviewPhase && phase.allowMultipleResponses) {
				showGatekeeper = true;
				showWidgets = false;
			} else {
				advanceToNext();
			}
		} catch (err) {
			message = { type: 'error', text: i18n.platform('survey.save_error') };
			console.error(err);
		} finally {
			saving = false;
		}
	}

	function getNextResponseIndex(): number {
		const existing = responseStore.byStimulus.get(currentItemId);
		return existing ? existing.length : 0;
	}

	function advanceToNext() {
		const nextIndex = responseStore.currentIndex + 1;
		if (nextIndex < items.length) {
			responseStore.currentIndex = nextIndex;
		} else {
			checkCompletion();
		}
	}

	function handleItemSelect(item: StimulusItemType) {
		// Block navigation to completed items when allowRevisit is false
		if (!isReviewPhase && !phase?.allowRevisit && responseStore.completedStimuli.has(item.id)) {
			return;
		}
		// StimulusNav passes StimulusItemType-shaped objects; for review, we use index lookup
		const idx = items.findIndex(s => {
			if (isReviewPhase) return (s as ResponseRecord).id === item.id;
			return (s as StimulusItemType).id === item.id;
		});
		if (idx >= 0) responseStore.currentIndex = idx;
	}

	function checkCompletion() {
		if (completionModalShown) return;
		const navItems = getNavItems();
		const allDone = navItems.every(s => responseStore.completedStimuli.has(s.id));
		if (allDone && navItems.length > 0) {
			showCompletionModal = true;
			completionModalShown = true;
		}
	}

	async function handleLogout() {
		await fetch(`/e/${slug}/auth`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'logout' })
		});
		participantStore.current = null;
		responseStore.list = [];
		goto(`/e/${slug}`);
	}

	// Build nav items for StimulusNav (needs id + label shape)
	function getNavItems(): { id: string; label?: Record<string, string> }[] {
		if (isReviewPhase) {
			return (items as ResponseRecord[]).map((r, i) => ({
				id: r.id,
				label: { en: `${i + 1}`, ja: `${i + 1}` }
			}));
		}
		return config?.stimuli?.items ?? [];
	}

	let navItems = $derived(getNavItems());
	let currentResponses = $derived(responseStore.byStimulus.get(currentItemId) ?? []);
	let completedCount = $derived(responseStore.completedStimuli.size);
</script>

<svelte:head>
	<title>{data.experiment ? i18n.localized(data.experiment.config.metadata.title) : (config ? i18n.localized(config.metadata.title) : 'Survey')}</title>
</svelte:head>

<Header onLogout={handleLogout} />

<main class="container">
	{#if config && phase && currentItem}
		<!-- Participant name -->
		<p class="text-sm text-gray-500 mb-3">
			{participantStore.current?.registrationData?.name as string ?? participantStore.current?.email ?? ''}
		</p>

		<!-- Phase title (for review phases) -->
		{#if isReviewPhase && phase.title}
			<h2 class="text-lg font-semibold mb-2">{i18n.localized(phase.title)}</h2>
		{/if}

		<!-- Progress -->
		<ProgressBar current={completedCount} total={items.length} />

		<!-- Stimulus / Review item display -->
		<div class="mt-4 mb-4">
			{#if isReviewPhase}
				<ReviewItemDisplay
					sourceResponse={currentItem as ResponseRecord}
					stimuliConfig={config.stimuli}
					stimulusItem={currentStimulusItem ?? undefined}
					replayMode={phase.reviewConfig?.replayMode ?? 'segment'}
					bind:mediaElement
				/>
			{:else}
				<StimulusRenderer
					item={currentItem as StimulusItemType}
					config={config.stimuli}
					bind:mediaElement
				/>
			{/if}
		</div>

		<!-- Item navigation -->
		<StimulusNav
			items={navItems as StimulusItemType[]}
			activeId={currentItemId}
			completionMap={responseStore.completedStimuli}
			onselect={handleItemSelect}
		/>

		<!-- Existing responses for this item -->
		{#if currentResponses.length > 0 && !isReviewPhase}
			<div class="mt-3 p-3 bg-gray-50 rounded border text-sm">
				<p class="font-medium text-gray-700 mb-2">{i18n.platform('common.saved_responses')}</p>
				{#each currentResponses as resp}
					<div class="mb-1 text-gray-600">
						{#each Object.entries(resp.response_data) as [key, val]}
							{#if key !== '_timestamp' && val !== 'null' && val !== null}
								<span class="mr-3"><strong>{key}:</strong> {val}</span>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		{#if message}
			<div class="message {message.type} mt-3">{message.text}</div>
		{/if}

		<!-- Gatekeeper + Response widgets: keyed by phase+index to force remount on every stimulus change -->
		{#key `${phase.id}-${responseStore.currentIndex}`}
			<!-- Gatekeeper question (stimulus-response only) -->
			{#if showGatekeeper && phase.gatekeeperQuestion && !isReviewPhase}
				<div class="mt-6 text-center">
					<p class="text-sm font-medium mb-4">
						{i18n.localized(phase.gatekeeperQuestion.text)}
					</p>
					<div class="flex gap-4 justify-center">
						<button
							id="gatekeeper-yes"
							class="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors cursor-pointer"
							onclick={handleYes}
							disabled={saving}
						>
							{i18n.localized(phase.gatekeeperQuestion.yesLabel, i18n.platform('common.yes'))}
						</button>
						<button
							id="gatekeeper-no"
							class="px-6 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors cursor-pointer"
							onclick={handleNo}
							disabled={saving}
						>
							{i18n.localized(phase.gatekeeperQuestion.noLabel, i18n.platform('common.no'))}
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
							bind:value={widgetValues[widget.id]}
							{mediaElement}
							onAudioReady={handleAudioReady}
						/>
					{/each}

					<button
						class="w-full mt-4 bg-indigo-600 text-white font-medium py-2 px-4 rounded hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
						onclick={handleSave}
						disabled={saving}
					>
						{saving ? i18n.platform('common.saving') : i18n.platform('common.save')}
					</button>
				</div>
			{/if}
		{/key}

		<!-- For review: show saved reasoning if already completed -->
		{#if isReviewPhase && currentResponses.length > 0}
			<div class="mt-3 p-3 bg-green-50 rounded border border-green-200 text-sm">
				<p class="font-medium text-green-800 mb-2">{i18n.platform('common.saved_responses')}</p>
				{#each currentResponses as resp}
					<div class="mb-1 text-green-700">
						{#each Object.entries(resp.response_data) as [key, val]}
							{#if key !== '_timestamp' && val !== 'null' && val !== null}
								<span class="mr-3"><strong>{key}:</strong> {val}</span>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Completion modal -->
		<Modal show={showCompletionModal} title={phase.completion ? i18n.localized(phase.completion.title) : i18n.platform('survey.completion_title')} onclose={() => { showCompletionModal = false; }}>
			<p class="text-gray-600 mb-4">
				{phase.completion ? i18n.localized(phase.completion.body) : i18n.platform('survey.completion_body')}
			</p>
			{@const currentPhaseIndex = config.phases.findIndex(p => p.id === phase.id)}
			{@const nextPhase = currentPhaseIndex >= 0 ? config.phases[currentPhaseIndex + 1] : undefined}
			<div class="flex gap-3">
				{#if nextPhase}
					<button
						class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer"
						onclick={() => { showCompletionModal = false; goto(`/e/${slug}/${nextPhase.slug}`); }}
					>
						{phase.completion?.nextPhaseButton ? i18n.localized(phase.completion.nextPhaseButton) : i18n.platform('survey.next_phase')}
					</button>
				{/if}
				<button
					class="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 cursor-pointer"
					onclick={() => { showCompletionModal = false; }}
				>
					{phase.completion?.stayButton ? i18n.localized(phase.completion.stayButton) : i18n.platform('survey.stay_on_page')}
				</button>
			</div>
		</Modal>

		<!-- No review items message -->
	{:else if isReviewPhase && items.length === 0}
		<div class="flex flex-col items-center justify-center py-20">
			<p class="text-gray-500">{i18n.platform('review.no_items')}</p>
		</div>
	{:else if !isReviewPhase && config && phase && (config.stimuli?.items ?? []).length === 0}
		<!-- No stimuli configured for this stimulus-response phase -->
		<div class="flex flex-col items-center justify-center py-20">
			<p class="text-gray-500">No stimuli have been configured for this phase.</p>
		</div>
	{:else}
		<div class="flex justify-center items-center py-20">
			<div class="spinner w-8 h-8"></div>
		</div>
	{/if}
</main>
