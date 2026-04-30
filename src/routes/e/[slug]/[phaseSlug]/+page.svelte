<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { page } from '$app/stores';
	import { experiment } from '$lib/stores/experiment.svelte';
	import { participantStore } from '$lib/stores/participant.svelte';
	import { responseStore } from '$lib/stores/responses.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { seededShuffle } from '$lib/utils';
	import { createReplayController } from '$lib/utils/replay';
	import Header from '$lib/components/layout/Header.svelte';
	import ProgressBar from '$lib/components/layout/ProgressBar.svelte';
	import StimulusNav from '$lib/components/layout/StimulusNav.svelte';
	import Modal from '$lib/components/layout/Modal.svelte';
	import StimulusRenderer from '$lib/components/stimuli/StimulusRenderer.svelte';
	import { getStimulusVideoUrl } from '$lib/components/stimuli/VideoPlayer.svelte';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import WidgetRenderer from '$lib/components/widgets/WidgetRenderer.svelte';
	import ReviewItemDisplay from '$lib/components/review/ReviewItemDisplay.svelte';
	import type { StimulusItemType, PhaseConfigType, ResponseWidgetType } from '$lib/config/schema';
	import type { ResponseRecord } from '$lib/services/data';

	let { data } = $props();

	let config = $derived(experiment.config);
	let slug = $derived($page.params.slug);
	let chunkSlug = $derived((data as Record<string, unknown>).chunkSlug as string | undefined);
	let phase = $derived(data.phase as PhaseConfigType);
	let isReviewPhase = $derived(phase?.type === 'review');
	let phaseSlug = $derived(phase?.slug ?? '');

	// Stable seed for `stimulusOrder: 'random'`. Generated once per page mount
	// and reset on phase navigation below, so the shuffle is deterministic
	// within a visit (survives reactive re-runs) but different across visits.
	let randomOrderSeed = $state(crypto.randomUUID());

	/** Build a phase URL, chunk-aware if chunkSlug is present */
	function phaseUrl(targetPhaseSlug: string) {
		return chunkSlug
			? `/e/${slug}/c/${chunkSlug}/${targetPhaseSlug}`
			: `/e/${slug}/${targetPhaseSlug}`;
	}

	// Active widgets: review uses reviewConfig.responseWidgets, stimulus-response uses phase.responseWidgets
	let activeWidgets: ResponseWidgetType[] = $derived(
		isReviewPhase && phase?.reviewConfig
			? phase.reviewConfig.responseWidgets
			: phase?.responseWidgets ?? []
	);

	// Items to navigate: stimuli items for stimulus-response, filtered source responses for review
	// Applies stimulus ordering (sequential, random, random-per-participant)
	// When orderedStimulusIds is provided (chunked route), use that ordering instead
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

		// Chunked route: server already computed the ordered stimulus IDs.
		// `orderedStimulusIds` is only present on the chunked variant of the
		// loader — cast to read it without forcing the non-chunked PageData
		// shape to declare a field it never returns.
		const orderedStimulusIds = (data as { orderedStimulusIds?: string[] }).orderedStimulusIds;
		if (orderedStimulusIds) {
			const itemMap = new Map(rawItems.map(s => [s.id, s]));
			return orderedStimulusIds
				.map(id => itemMap.get(id))
				.filter((s): s is typeof rawItems[number] => !!s);
		}

		const order = phase?.stimulusOrder ?? 'sequential';
		if (order === 'random') {
			return seededShuffle(rawItems, randomOrderSeed);
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

	// Gatekeeper state machine. `engage` is the first encounter on a stimulus
	// (no prior responses); `continue` is the re-prompt after at least one
	// response has been saved (only reachable when allowMultipleResponses=true).
	// Both the gatekeeper render and handleNo branch on this — engage's "No"
	// writes a skip row, continue's "No" just advances ("no more to add").
	// Prefetch the next video so it starts loading while the participant is on the current one.
	// Works for both regular and review phases; restricted to video stimuli only.
	let nextVideoUrl = $derived.by(() => {
		if (config?.stimuli?.type !== 'video') return null;
		const nextItem = items[responseStore.currentIndex + 1];
		if (!nextItem) return null;
		let nextStimulusItem: StimulusItemType | undefined;
		if (isReviewPhase) {
			const nextResp = nextItem as ResponseRecord;
			nextStimulusItem = config.stimuli.items.find(s => s.id === nextResp.stimulus_id);
		} else {
			nextStimulusItem = nextItem as StimulusItemType;
		}
		if (!nextStimulusItem || !config.stimuli) return null;
		return getStimulusVideoUrl(nextStimulusItem, config.stimuli) || null;
	});

	let gateMode = $derived<'engage' | 'continue'>(
		(responseStore.byStimulus.get(currentItemId)?.length ?? 0) > 0 ? 'continue' : 'engage'
	);
	// Pick the prompt to render. Falls back to `initial` when `subsequent` is
	// omitted from the config — backwards compatible with single-prompt configs.
	let gatePrompt = $derived(
		gateMode === 'continue' && phase?.gatekeeperQuestion?.subsequent
			? phase.gatekeeperQuestion.subsequent
			: phase?.gatekeeperQuestion?.initial
	);

	let mediaElement: HTMLMediaElement | undefined = $state(undefined);
	let widgetValues = $state<Record<string, string>>({});
	let audioBlobs = $state<Record<string, Blob>>({});
	let showGatekeeper = $state(true);
	let showWidgets = $state(false);
	let showBreakScreen = $state(false);
	let breakCountdown = $state(0);
	let breakTimerInterval: ReturnType<typeof setInterval> | undefined = undefined;
	let saving = $state(false);
	let gatekeeperClicked = $state<'yes' | 'no' | null>(null);
	let responsesLoaded = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let showCompletionModal = $state(false);
	let completionModalShown = $state(false);
	let highlightActive = $state(false);
	const replayController = createReplayController();

	function handleReplayRequest(start: number, end: number, mode: 'segment' | 'full-highlight') {
		if (!mediaElement) return;
		if (mode === 'full-highlight') {
			replayController.replayFullWithHighlight(mediaElement, start, end, (active) => {
				highlightActive = active;
			});
		} else {
			replayController.replaySegment(mediaElement, start, end);
		}
	}

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
		randomOrderSeed = crypto.randomUUID();
	});

	// Always clear any running break timers when the component unmounts
	// (e.g. participant navigates to a different phase mid-countdown). Without
	// this, the intervals keep ticking and decrement state on a destroyed
	// component, leaking memory and risking onMount/onDestroy ordering bugs.
	$effect(() => {
		return () => {
			if (breakTimerInterval) { clearInterval(breakTimerInterval); breakTimerInterval = undefined; }
			if (nextChunkTimerInterval) { clearInterval(nextChunkTimerInterval); nextChunkTimerInterval = undefined; }
		};
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

	// Clear gatekeeper click feedback whenever the current item changes (covers
	// both the sync `continue` path and the async `engage` path in handleNo).
	$effect(() => {
		currentItemId;
		gatekeeperClicked = null;
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

	async function handleYes() {
		gatekeeperClicked = 'yes';
		await tick();
		showGatekeeper = false;
		showWidgets = true;
		gatekeeperClicked = null;
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

		// On `continue` (re-prompt after at least one saved response), "No" means
		// "no more to add" — just advance, don't write a skip row. On `engage`
		// (first encounter), "No" writes a skip row with JSON null per widget so
		// the dataset records "this stimulus was shown but the participant
		// declined to engage."
		gatekeeperClicked = 'no';
		await tick(); // flush so the "…" renders before any sync or async work

		if (gateMode === 'continue') {
			advanceToNext();
			return;
		}

		saving = true;
		try {
			const responseData: Record<string, unknown> = {};
			for (const w of activeWidgets) {
				responseData[w.id] = null;
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

		// Validate required widgets (skip conditionally hidden ones)
		for (const w of activeWidgets) {
			if (!w.required) continue;
			if (!isWidgetVisible(w)) continue;
			if (w.type === 'timestamp-range') {
				const [start, end] = (widgetValues[w.id] || '').split(',');
				if (!start || !end) {
					message = { type: 'error', text: i18n.platform('survey.fill_in_required', { field: i18n.localized(w.label, w.id) }) };
					return;
				}
				if (parseFloat(start) >= parseFloat(end)) {
					message = { type: 'error', text: i18n.platform('timestamps.order_error') };
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
				// Hidden widgets get null
				if (!isWidgetVisible(w)) {
					responseData[w.id] = null;
					continue;
				}
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

	/** Check if a widget should be visible based on its conditionalOn config */
	function isWidgetVisible(widget: ResponseWidgetType): boolean {
		if (!widget.conditionalOn) return true;
		return widgetValues[widget.conditionalOn.widgetId] === widget.conditionalOn.value;
	}

	function shouldSkipStimulus(item: unknown): boolean {
		if (isReviewPhase || !phase?.skipRules?.length) return false;
		const stimItem = item as StimulusItemType;
		return phase.skipRules.some(rule => {
			if (rule.targetStimulusId !== stimItem.id) return false;
			const responses = responseStore.byStimulus.get(rule.condition.stimulusId);
			if (!responses?.length) return false;
			const lastResponse = responses[responses.length - 1];
			const widgetValue = String(lastResponse.response_data[rule.condition.widgetId] ?? '');
			return rule.condition.operator === 'equals'
				? widgetValue === rule.condition.value
				: widgetValue !== rule.condition.value;
		});
	}

	async function autoSkipStimulus(item: unknown) {
		const stimItem = item as StimulusItemType;
		// Already has a response (from a previous skip or manual entry) — don't duplicate
		if (responseStore.completedStimuli.has(stimItem.id)) return;
		const responseData: Record<string, unknown> = {};
		for (const w of activeWidgets) {
			responseData[w.id] = '_skipped_by_rule';
		}
		try {
			const res = await fetch(`/e/${slug}/${phaseSlug}/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phaseId: phase.id,
					stimulusId: stimItem.id,
					responseData,
					responseIndex: 0
				})
			});
			if (res.ok) {
				const saved = await res.json();
				responseStore.list = [...responseStore.list, saved];
			}
		} catch (err) {
			console.error('Failed to auto-skip stimulus:', err);
		}
	}

	async function advanceToNext() {
		let nextIndex = responseStore.currentIndex + 1;
		// Skip stimuli that match skip rules
		while (nextIndex < items.length && shouldSkipStimulus(items[nextIndex])) {
			await autoSkipStimulus(items[nextIndex]);
			nextIndex++;
		}
		if (nextIndex < items.length) {
			// Show break screen when crossing block boundaries
			if (breakScreen && isBlockBoundary(responseStore.currentIndex, nextIndex)) {
				startBreakScreen(nextIndex);
			} else {
				responseStore.currentIndex = nextIndex;
			}
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
			// Start break countdown for next chunk if this is the last phase of the chunk
			if (nextChunkUrl && !resolveNextPhase()) {
				const minBreakMinutes = config?.stimuli?.chunking?.minBreakMinutes;
				if (minBreakMinutes && minBreakMinutes > 0) {
					nextChunkCountdownSecs = minBreakMinutes * 60;
					nextChunkTimerInterval = setInterval(() => {
						nextChunkCountdownSecs--;
						if (nextChunkCountdownSecs <= 0) {
							clearInterval(nextChunkTimerInterval);
							nextChunkTimerInterval = undefined;
						}
					}, 1000);
				}
			}
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

	function evaluateBranchCondition(condition: { widgetId: string; stimulusId?: string; operator: 'equals' | 'not_equals'; value: string }): boolean {
		if (condition.stimulusId) {
			const responses = responseStore.byStimulus.get(condition.stimulusId);
			if (!responses?.length) return false;
			const last = responses[responses.length - 1];
			const val = String(last.response_data[condition.widgetId] ?? '');
			return condition.operator === 'equals' ? val === condition.value : val !== condition.value;
		}
		for (const [, responses] of responseStore.byStimulus) {
			if (!responses.length) continue;
			const last = responses[responses.length - 1];
			const val = String(last.response_data[condition.widgetId] ?? '');
			const match = condition.operator === 'equals' ? val === condition.value : val !== condition.value;
			if (match) return true;
		}
		return false;
	}

	function resolveNextPhase(): PhaseConfigType | undefined {
		if (!config) return undefined;
		const currentPhaseIndex = config.phases.findIndex(p => p.id === phase.id);
		if (currentPhaseIndex < 0) return undefined;
		if (phase.branchRules?.length) {
			for (const rule of phase.branchRules) {
				if (evaluateBranchCondition(rule.condition)) {
					return config.phases.find(p => p.slug === rule.nextPhaseSlug);
				}
			}
		}
		return config.phases[currentPhaseIndex + 1];
	}

	// Block boundaries and break screen (chunked route only)
	let blockBoundaries = $derived((data as Record<string, unknown>).blockBoundaries as { blockId: string; startIndex: number; endIndex: number; label?: Record<string, string> }[] | undefined);
	let breakScreen = $derived((data as Record<string, unknown>).breakScreen as { title: Record<string, string>; body: Record<string, string>; duration?: number } | null | undefined);

	let currentBlockInfo = $derived.by(() => {
		if (!blockBoundaries) return null;
		const idx = responseStore.currentIndex;
		const block = blockBoundaries.find(b => idx >= b.startIndex && idx <= b.endIndex);
		if (!block) return null;
		const blockStimIds = items.slice(block.startIndex, block.endIndex + 1).map(s => (s as StimulusItemType).id);
		const completed = blockStimIds.filter(id => responseStore.completedStimuli.has(id)).length;
		return {
			blockIndex: blockBoundaries.indexOf(block) + 1,
			totalBlocks: blockBoundaries.length,
			completed,
			total: blockStimIds.length
		};
	});

	/** Pending index to navigate to after break screen is dismissed */
	let pendingBreakIndex = $state(-1);

	// Next-chunk navigation (chunked route, last phase of chunk)
	let nextChunkUrl = $derived.by(() => {
		if (!chunkSlug || !config) return null;
		const chunks = config.stimuli?.chunking?.chunks ?? [];
		const idx = chunks.findIndex((c: { slug: string }) => c.slug === chunkSlug);
		if (idx < 0 || idx >= chunks.length - 1) return null;
		const nextChunk = chunks[idx + 1];
		return `/e/${slug}/c/${nextChunk.slug}/${config.phases[0]?.slug ?? 'survey'}`;
	});

	let nextChunkCountdownSecs = $state(0);
	let nextChunkTimerInterval: ReturnType<typeof setInterval> | undefined;

	function isBlockBoundary(fromIndex: number, toIndex: number): boolean {
		if (!blockBoundaries) return false;
		const fromBlock = blockBoundaries.find(b => fromIndex >= b.startIndex && fromIndex <= b.endIndex);
		const toBlock = blockBoundaries.find(b => toIndex >= b.startIndex && toIndex <= b.endIndex);
		return !!fromBlock && !!toBlock && fromBlock.blockId !== toBlock.blockId;
	}

	function startBreakScreen(nextIndex: number) {
		pendingBreakIndex = nextIndex;
		showBreakScreen = true;
		const duration = breakScreen?.duration;
		if (duration && duration > 0) {
			breakCountdown = duration;
			breakTimerInterval = setInterval(() => {
				breakCountdown--;
				if (breakCountdown <= 0) {
					clearInterval(breakTimerInterval);
					breakTimerInterval = undefined;
				}
			}, 1000);
		}
	}

	function dismissBreakScreen() {
		showBreakScreen = false;
		if (breakTimerInterval) { clearInterval(breakTimerInterval); breakTimerInterval = undefined; }
		if (pendingBreakIndex >= 0) {
			responseStore.currentIndex = pendingBreakIndex;
			pendingBreakIndex = -1;
		}
	}

	let navItems = $derived(getNavItems());
	let currentResponses = $derived(responseStore.byStimulus.get(currentItemId) ?? []);
	let completedCount = $derived(responseStore.completedStimuli.size);
	// Map from widget id → widget type for use in the saved-responses display.
	let widgetTypeMap = $derived(new Map(activeWidgets.map(w => [w.id, w.type])));
</script>

<svelte:head>
	<title>{data.experiment ? i18n.localized(data.experiment.config.metadata.title) : (config ? i18n.localized(config.metadata.title) : 'Survey')}</title>
	{#if nextVideoUrl}<link rel="prefetch" href={nextVideoUrl} />{/if}
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

		<!-- Phase-complete banner (shown after modal is dismissed via "stay on page") -->
		{#if completionModalShown && !showCompletionModal}
			<button
				type="button"
				onclick={() => { showCompletionModal = true; }}
				class="w-full mb-3 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded px-3 py-2 text-sm cursor-pointer hover:bg-indigo-100"
			>
				<span class="text-indigo-700 font-medium">{i18n.platform('survey.completion_title')}</span>
				<span class="text-indigo-600">{i18n.platform('survey.next_phase')} →</span>
			</button>
		{/if}

		<!-- Progress -->
		<ProgressBar current={completedCount} total={items.length} />

		{#if currentBlockInfo}
			<p class="text-xs text-gray-500 mt-1">
				Block {currentBlockInfo.blockIndex}/{currentBlockInfo.totalBlocks} — {currentBlockInfo.completed}/{currentBlockInfo.total} completed
			</p>
		{/if}

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
				<div class="rounded-lg transition-all duration-200" class:ring-4={highlightActive} class:ring-indigo-500={highlightActive}>
					<StimulusRenderer
						item={currentItem as StimulusItemType}
						config={config.stimuli}
						bind:mediaElement
					/>
				</div>
			{/if}
		</div>

		<!-- Item navigation (hidden when revisiting is disabled) -->
		{#if isReviewPhase ? (phase.reviewConfig?.allowNavigation === true) : (phase.allowRevisit !== false)}
			<StimulusNav
				items={navItems as StimulusItemType[]}
				activeId={currentItemId}
				completionMap={responseStore.completedStimuli}
				onselect={handleItemSelect}
			/>
		{/if}

		<!-- Existing responses for this item -->
		{#if currentResponses.length > 0 && !isReviewPhase}
			<div class="mt-3 p-3 bg-gray-50 rounded border text-sm">
				<p class="font-medium text-gray-700 mb-2">{i18n.platform('common.saved_responses')}</p>
				{#each currentResponses as resp}
					<div class="mb-1 text-gray-600">
						{#each Object.entries(resp.response_data) as [key, val]}
							{#if key !== '_timestamp' && val !== 'null' && val !== null}
								<span class="mr-3">
									<strong>{key}:</strong>
									{#if widgetTypeMap.get(key) === 'audio-recording' && typeof val === 'string'}
										<audio src="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/experiments/{val}" controls class="inline h-8 w-48 align-middle ml-1"></audio>
									{:else}
										{val}
									{/if}
								</span>
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
			{#if showGatekeeper && gatePrompt && !isReviewPhase}
				<div class="mt-6 text-center">
					<p class="text-sm font-medium mb-4">
						{i18n.localized(gatePrompt.text)}
					</p>
					<div class="flex gap-4 justify-center">
						<button
							id="gatekeeper-yes"
							class="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors cursor-pointer disabled:opacity-60"
							onclick={handleYes}
							disabled={saving || gatekeeperClicked !== null}
						>
							{gatekeeperClicked === 'yes' ? '…' : i18n.localized(gatePrompt.yesLabel, i18n.platform('common.yes'))}
						</button>
						<button
							id="gatekeeper-no"
							class="px-6 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors cursor-pointer disabled:opacity-60"
							onclick={handleNo}
							disabled={saving || gatekeeperClicked !== null}
						>
							{gatekeeperClicked === 'no' ? '…' : i18n.localized(gatePrompt.noLabel, i18n.platform('common.no'))}
						</button>
					</div>
				</div>
			{/if}

			<!-- Response widgets -->
			{#if showWidgets}
				<div class="mt-6 space-y-2">
					{#each activeWidgets as widget (widget.id)}
						{#if isWidgetVisible(widget)}
							<WidgetRenderer
								{widget}
								bind:value={widgetValues[widget.id]}
								{mediaElement}
								onAudioReady={handleAudioReady}
								onReplayRequest={handleReplayRequest}
							/>
						{/if}
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
								<span class="mr-3">
									<strong>{key}:</strong>
									{#if widgetTypeMap.get(key) === 'audio-recording' && typeof val === 'string'}
										<audio src="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/experiments/{val}" controls class="inline h-8 w-48 align-middle ml-1"></audio>
									{:else}
										{val}
									{/if}
								</span>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Break screen modal (between blocks in chunked experiments) -->
		{#if breakScreen}
			<Modal show={showBreakScreen} title={i18n.localized(breakScreen.title)} onclose={dismissBreakScreen}>
				<p class="text-gray-600 mb-4">{i18n.localized(breakScreen.body)}</p>
				<button
					class="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={dismissBreakScreen}
					disabled={breakCountdown > 0}
				>
					{breakCountdown > 0 ? `${i18n.platform('common.continue')} (${breakCountdown}s)` : i18n.platform('common.continue')}
				</button>
			</Modal>
		{/if}

		<!-- Completion modal -->
		<Modal show={showCompletionModal} title={phase.completion ? i18n.localized(phase.completion.title) : i18n.platform('survey.completion_title')} onclose={() => { showCompletionModal = false; }}>
			<p class="text-gray-600 mb-4">
				{phase.completion ? i18n.localized(phase.completion.body) : i18n.platform('survey.completion_body')}
			</p>
			{@const nextPhase = resolveNextPhase()}
			<div class="flex gap-3">
				{#if nextPhase}
					<!-- Next phase within same chunk (or non-chunked) -->
					<button
						class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer"
						onclick={() => { showCompletionModal = false; goto(phaseUrl(nextPhase.slug)); }}
					>
						{phase.completion?.nextPhaseButton ? i18n.localized(phase.completion.nextPhaseButton) : i18n.platform('survey.next_phase')}
					</button>
				{:else if nextChunkUrl}
					<!-- Last phase of this chunk — next chunk button with optional countdown -->
					{#if nextChunkCountdownSecs > 0}
						{@const m = Math.floor(nextChunkCountdownSecs / 60)}
						{@const s = nextChunkCountdownSecs % 60}
						<button disabled class="flex-1 bg-indigo-300 text-white py-2 px-4 rounded cursor-not-allowed select-none">
							Next chunk in {m > 0 ? `${m}m ` : ''}{s}s
						</button>
					{:else}
						<button
							class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer"
							onclick={() => { showCompletionModal = false; goto(nextChunkUrl); }}
						>
							Start next chunk →
						</button>
					{/if}
				{:else}
					<!-- Last phase, last chunk (or no chunking) — finish experiment -->
					<button
						class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer"
						onclick={() => { showCompletionModal = false; window.location.href = `/e/${slug}/complete`; }}
					>
						{phase.completion?.nextPhaseButton ? i18n.localized(phase.completion.nextPhaseButton) : i18n.platform('survey.finish_experiment')}
					</button>
				{/if}
				{#if phase.allowRevisit !== false}
					<button
						class="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 cursor-pointer"
						onclick={() => { showCompletionModal = false; }}
					>
						{phase.completion?.stayButton ? i18n.localized(phase.completion.stayButton) : i18n.platform('survey.stay_on_page')}
					</button>
				{/if}
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
