<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { page } from '$app/stores';
	import { experiment } from '$lib/stores/experiment.svelte';
	import { participantStore } from '$lib/stores/participant.svelte';
	import { responseStore } from '$lib/stores/responses.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { seededShuffle, formatDuration } from '$lib/utils';
	import { formatTimestamp } from '$lib/utils/time-format';
	import { widgetEntries, widgetKeys, isAllNullResponse, inScopeForChunk, isStimulusDoneInChunk } from '$lib/utils/response-data';
	import { createReplayController } from '$lib/utils/replay';
	import Header from '$lib/components/layout/Header.svelte';
	import Modal from '$lib/components/layout/Modal.svelte';
	import StimulusRenderer from '$lib/components/stimuli/StimulusRenderer.svelte';
	import { getStimulusVideoUrl } from '$lib/components/stimuli/VideoPlayer.svelte';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import WidgetRenderer from '$lib/components/widgets/WidgetRenderer.svelte';
	import ReviewItemDisplay from '$lib/components/review/ReviewItemDisplay.svelte';
	import GatekeeperPrompt from '$lib/components/participant/GatekeeperPrompt.svelte';
	import BreakModal from '$lib/components/participant/BreakModal.svelte';
	import BlockProgress from '$lib/components/participant/BlockProgress.svelte';
	import CompletionModal, { type CompletionState } from '$lib/components/participant/CompletionModal.svelte';
	import NavStrip from '$lib/components/participant/NavStrip.svelte';
	import {
		validateWidgets,
		buildResponseData,
		buildSkipResponseData,
		uploadAudioBlobs,
		persistResponse
	} from '$lib/services/response-save';
	import type { StimulusItemType, PhaseConfigType, ResponseWidgetType } from '$lib/config/schema';
	import type { ResponseRecord } from '$lib/services/data';

	let { data } = $props();

	let config = $derived(experiment.config);
	let slug = $derived($page.params.slug);
	let chunkSlug = $derived((data as Record<string, unknown>).chunkSlug as string | undefined);

	// Mid-chunk re-entry: server returns resumeContext when 0 < completed < total.
	// Show a one-time "Welcome back" screen on mount, dismissed for the rest of
	// this page session.
	let resumeContext = $derived(
		(data as Record<string, unknown>).resumeContext as { completed: number; total: number } | null | undefined
	);
	let resumeDismissed = $state(false);
	let showResume = $derived(!!resumeContext && !resumeDismissed);

	// One-shot "Welcome back, {name}" toast set by the landing page on
	// existing-account login. Auto-fades after 3 s; sessionStorage flag is
	// cleared on read so subsequent navigations don't re-show it.
	let welcomeToast = $state<string | null>(null);
	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			const name = sessionStorage.getItem('welcomeBackName');
			if (name !== null) {
				sessionStorage.removeItem('welcomeBackName');
				welcomeToast = name
					? i18n.platform('registration.welcome_back_named', { name })
					: i18n.platform('registration.welcome_back');
				setTimeout(() => { welcomeToast = null; }, 3000);
			}
		} catch { /* sessionStorage unavailable — silent no-op */ }
	});

	// Sticky error toast for save failures. The inline `message` state gets
	// cleared at the start of every retry click, so a fast retry hides the
	// "Failed to save" message before the participant can see it. This toast
	// persists for 5 s independent of click state, so even rapid retry-flow
	// failures stay visible. Click to dismiss.
	let saveErrorToast = $state<string | null>(null);
	let saveErrorTimeout: ReturnType<typeof setTimeout> | undefined;
	function showSaveError() {
		saveErrorToast = i18n.platform('survey.save_error');
		if (saveErrorTimeout) clearTimeout(saveErrorTimeout);
		saveErrorTimeout = setTimeout(() => { saveErrorToast = null; }, 5000);
	}

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
				filtered = filtered.filter((r) => !isAllNullResponse(r.response_data));
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

	// Per-participant chunk traversal order (chunked route only). Used by both
	// `chunkCompletion` (anchor per-chunk fallback) and `nextChunkUrl` further
	// down. Declared up here so chunkCompletion / gateMode can reference it.
	let orderedChunkSlugs = $derived(
		((data as Record<string, unknown>).orderedChunkSlugs as string[] | undefined) ?? null
	);

	/**
	 * Canonical per-stimulus completion state from the perspective of THIS
	 * chunk view. Single source of truth for the progress bar, StimulusNav
	 * button colors, block-info count, gatekeeper-prior-response check, and
	 * `checkCompletion` allDone test.
	 *
	 * - Regular stimuli: present if any prior response exists.
	 * - Anchor stimuli on a chunked route: present only if a prior response
	 *   has `_chunk === chunkSlug` (so anchors re-engage in each new chunk
	 *   visit for test-retest reliability).
	 * - Anchors with no `_chunk` field (legacy responses pre-F7): treated as
	 *   if they belong to the participant's first chunk in their ordering.
	 * - Value 'completed' vs 'skipped' depends on whether the in-scope
	 *   responses have any non-null widget value.
	 */
	let chunkCompletion = $derived.by(() => {
		const m = new Map<string, 'completed' | 'skipped'>();
		if (isReviewPhase) {
			// Review phases use response UUIDs as stimulus_id, no anchor concept.
			const completed = responseStore.completedStimuli;
			for (const item of items) {
				const id = (item as ResponseRecord).id;
				const state = completed.get(id);
				if (state) m.set(id, state);
			}
			return m;
		}
		for (const item of items as StimulusItemType[]) {
			const responses = responseStore.byStimulus.get(item.id) ?? [];
			const inScope = inScopeForChunk(item, chunkSlug, responses);
			if (inScope.length === 0) continue;
			m.set(item.id, inScope.every((r) => isAllNullResponse(r.response_data)) ? 'skipped' : 'completed');
		}
		return m;
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
	let signedUrls = $derived((data as Record<string, unknown>).signedUrls as Record<string, string> | undefined ?? {});

	// Signed URL for the current stimulus (undefined for review phases — those go through ReviewItemDisplay)
	let currentSrc = $derived(!isReviewPhase && currentStimulusItem
		? (signedUrls[(currentItem as StimulusItemType).id] || undefined)
		: undefined);

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
		return signedUrls[nextStimulusItem.id] || getStimulusVideoUrl(nextStimulusItem, config.stimuli) || null;
	});

	// Chunk-aware: anchors in a fresh chunk visit start over at 'engage' even
	// if rated in a prior chunk. Non-anchor stimuli behave as before (any prior
	// response anywhere flips to 'continue').
	let gateMode = $derived<'engage' | 'continue'>(
		chunkCompletion.has(currentItemId) ? 'continue' : 'engage'
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

	// Visual start/end markers for the video scrubber, derived from any
	// timestamp-range widget the participant is currently filling in. Reuses
	// the same `value.split(',')` parsing convention TimestampRangeWidget
	// emits (see TimestampRangeWidget.svelte) — single source of truth.
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

	// Reset all state when phase OR chunk changes. Tracking `chunkSlug` matters
	// because the SvelteKit route segment is identical between two chunks
	// (`survey` → `survey`), so the component is reused — without this reset,
	// `completionModalShown`, the previous chunk's currentIndex, and the
	// just-completed banner all leak into the new chunk's first render.
	$effect(() => {
		phaseSlug;
		chunkSlug;
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
		landedOnFirstIncomplete = false;
	});

	// Land on the first incomplete stimulus when the chunked phase loads
	// (B3 fix). Without this, the participant would land on stimulus 1 even if
	// they'd already finished 30/94 — and on a completed-stimulus landing with
	// `allowMultipleResponses=false`, both gatekeeper and widgets are
	// suppressed by design, so the page renders as a blank with just video +
	// nav. Run once per phase mount, after both responses and the ordered list
	// are loaded — then leave currentIndex alone so manual back-nav is honoured.
	//
	// Special case: when ALL stimuli are complete (firstIncomplete === -1),
	// land on the LAST item so the block-info display reads "Block 3/3 — 31/31"
	// instead of "Block 1/3 — 32/32" (which would be wrong since the user is
	// done with all blocks).
	let landedOnFirstIncomplete = $state(false);
	$effect(() => {
		if (landedOnFirstIncomplete) return;
		if (!responsesLoaded) return;
		// Chunked routes pass orderedStimulusIds explicitly; non-chunked routes
		// fall back to the participant-ordered `items` list. Either way,
		// `chunkCompletion` is the canonical "is this done in this view?"
		// source.
		const chunkedIds = (data as { orderedStimulusIds?: string[] }).orderedStimulusIds;
		const orderedIds = chunkedIds ?? items.map((it) => isReviewPhase ? (it as ResponseRecord).id : (it as StimulusItemType).id);
		if (orderedIds.length === 0) return;
		const firstIncomplete = orderedIds.findIndex((id) => !chunkCompletion.has(id));
		if (firstIncomplete > 0) {
			responseStore.currentIndex = firstIncomplete;
		} else if (firstIncomplete === -1) {
			responseStore.currentIndex = orderedIds.length - 1;
		}
		landedOnFirstIncomplete = true;
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
		// Drop any active replay listener from the previous stimulus before the
		// media element re-binds. Without this, a `timeupdate`/`seeking` handler
		// from the prior stimulus could fire on the new video.
		if (mediaElement) replayController.cleanup(mediaElement);

		const defaults: Record<string, string> = {};
		for (const w of activeWidgets) {
			// Sliders initialize to their min value so position matches logical state
			defaults[w.id] = w.type === 'slider' ? String(w.config?.min ?? 0) : '';
		}
		widgetValues = defaults;
		audioBlobs = {};
		message = null;

		// Chunk-aware "has the participant already responded to THIS item in
		// THIS chunk view?" check. For regular stimuli this is equivalent to
		// "any prior response exists" (chunkCompletion mirrors that). For
		// anchors on a chunked route, it's per-chunk so the gatekeeper engages
		// fresh each chunk visit.
		const hasExistingResponses = chunkCompletion.has(currentItemId);

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
			const responseData = buildSkipResponseData(activeWidgets, chunkSlug ?? null);
			const saved = await persistResponse(slug!, phaseSlug, {
				phaseId: phase.id,
				stimulusId: currentItemId,
				responseData,
				responseIndex: getNextResponseIndex()
			});
			responseStore.list = [...responseStore.list, saved];
			advanceToNext();
		} catch (err) {
			message = { type: 'error', text: i18n.platform('survey.save_error') };
			showSaveError();
			console.error(err);
		} finally {
			saving = false;
		}
	}

	async function handleSave() {
		if (!phase || !currentItem) return;

		const validation = validateWidgets(activeWidgets, widgetValues, isWidgetVisible);
		if (validation) {
			const w = validation.widget;
			message =
				validation.kind === 'timestamp_order'
					? { type: 'error', text: i18n.platform('timestamps.order_error') }
					: { type: 'error', text: i18n.platform('survey.fill_in_required', { field: i18n.localized(w.label, w.id) }) };
			return;
		}

		saving = true;
		message = null;

		try {
			// Upload audio first, then build the payload — failed audio uploads
			// must not produce a half-saved response (transactional contract).
			const audioToUpload: Record<string, Blob> = {};
			for (const w of activeWidgets) {
				if (w.type === 'audio-recording' && audioBlobs[w.id]) audioToUpload[w.id] = audioBlobs[w.id];
			}
			const audioPaths = await uploadAudioBlobs(audioToUpload, slug!, phaseSlug, currentItemId);

			const responseData = buildResponseData(activeWidgets, widgetValues, audioPaths, isWidgetVisible, chunkSlug ?? null);
			const saved = await persistResponse(slug!, phaseSlug, {
				phaseId: phase.id,
				stimulusId: currentItemId,
				responseData,
				responseIndex: getNextResponseIndex()
			});
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
			showSaveError();
			console.error(err);
		} finally {
			saving = false;
		}
	}

	function getNextResponseIndex(stimulusId: string = currentItemId): number {
		const existing = responseStore.byStimulus.get(stimulusId);
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
		// Already has a response IN THIS CHUNK — don't duplicate. For anchors
		// in a fresh chunk visit the rule fires again (different `_chunk` tag).
		if (chunkCompletion.has(stimItem.id)) return;
		const responseData: Record<string, unknown> = {};
		for (const w of activeWidgets) {
			responseData[w.id] = '_skipped_by_rule';
		}
		if (chunkSlug) responseData._chunk = chunkSlug;
		try {
			const res = await fetch(`/e/${slug}/${phaseSlug}/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phaseId: phase.id,
					stimulusId: stimItem.id,
					responseData,
					// For anchors that were auto-skipped in a prior chunk, the next
					// auto-skip in this chunk needs a fresh response_index to avoid
					// a unique-constraint collision on (participant, phase,
					// stimulus, response_index).
					responseIndex: getNextResponseIndex(stimItem.id)
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
			// Show break screen when crossing block boundaries — even when the
			// researcher didn't customise `breakScreen`, fall through to
			// platform-default encouraging copy. Researchers can opt out by
			// setting `chunking.breakScreen.disabled: true`.
			const isBoundary = isBlockBoundary(responseStore.currentIndex, nextIndex);
			const breakDisabled = breakScreen?.disabled === true;
			if (isBoundary && !breakDisabled) {
				startBreakScreen(nextIndex);
			} else {
				responseStore.currentIndex = nextIndex;
			}
		} else {
			checkCompletion();
		}
	}

	function handleItemSelect(item: StimulusItemType) {
		// Block navigation to completed items when allowRevisit is false.
		// (Uses the global completedStimuli — for non-anchor stimuli that's
		// the right semantic. allowRevisit=false + anchors is an unsupported
		// combination since anchors require re-engaging.)
		if (!isReviewPhase && !phase?.allowRevisit && responseStore.completedStimuli.has(item.id)) {
			return;
		}
		// StimulusNav passes StimulusItemType-shaped objects; for review, we use index lookup
		const idx = items.findIndex(s => {
			if (isReviewPhase) return (s as ResponseRecord).id === item.id;
			return (s as StimulusItemType).id === item.id;
		});
		if (idx >= 0) navigateToIndex(idx);
	}

	/**
	 * Boundary-aware navigation for any "jump to a specific stimulus" path
	 * (Prev/Next buttons, Jump-to nav, StimulusNav clicks). Forward navigation
	 * across a block boundary triggers the break-screen modal so the
	 * participant can't bypass the forced pause. Backward navigation
	 * (returning to an earlier item) skips the break — they've already passed
	 * it once.
	 */
	function navigateToIndex(targetIdx: number) {
		if (targetIdx < 0 || targetIdx >= items.length) return;
		const isBoundary = isBlockBoundary(responseStore.currentIndex, targetIdx);
		const goingForward = targetIdx > responseStore.currentIndex;
		const breakDisabled = breakScreen?.disabled === true;
		if (goingForward && isBoundary && !breakDisabled) {
			startBreakScreen(targetIdx);
		} else {
			responseStore.currentIndex = targetIdx;
		}
	}

	function checkCompletion() {
		if (completionModalShown) return;
		// Completion fires on the full phase (whole chunk in chunked context),
		// NOT just the visible block — `items` is the right source here. Uses
		// chunkCompletion so anchors are required to be rated IN THIS CHUNK
		// (a chunk-1 anchor rating doesn't satisfy chunk-3's completion).
		const allItems = items as Array<{ id: string }>;
		const allDone = allItems.every((s) => chunkCompletion.has(s.id));
		if (allDone && allItems.length > 0) {
			showCompletionModal = true;
			completionModalShown = true;
			// Start break countdown for next chunk if this is the last phase of
			// the chunk. Anchor to the actual last-response timestamp so a page
			// reload (HMR, browser refresh, server restart) doesn't snap the
			// countdown back to MAX — server-side `resolveParticipantNextChunk` already
			// enforces the wall-clock break, and the client just mirrors it.
			if (nextChunkUrl && !resolveNextPhase()) {
				const minBreakMinutes = config?.stimuli?.chunking?.minBreakMinutes;
				if (minBreakMinutes && minBreakMinutes > 0) {
					const timestamps = responseStore.list
						.map((r) => new Date(r.created_at).getTime())
						.filter((t) => Number.isFinite(t));
					const lastResponseAt = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
					const cooldownEndsAt = lastResponseAt + minBreakMinutes * 60 * 1000;
					nextChunkCountdownSecs = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
					if (nextChunkCountdownSecs > 0) {
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

	// Build nav items for StimulusNav (needs id + label shape).
	//
	// For stimulus-response phases we render the participant-ordered `items`,
	// not the raw `config.stimuli.items` (which is alphabetical by import order).
	// When the chunked route returns blockBoundaries, we slice to JUST the
	// current block so a 600-stimulus chunk doesn't print all 600 buttons.
	//
	// Labels: prefer `item.label` if set; otherwise use a block-relative
	// numeric label "1..N". This avoids dumping noisy auto-generated ids like
	// `s0467-2` onto the page while preserving meaningful labels for
	// experiments that set them.
	function getNavItems(): { id: string; label?: Record<string, string> }[] {
		if (isReviewPhase) {
			return (items as ResponseRecord[]).map((r, i) => ({
				id: r.id,
				label: { en: `${i + 1}`, ja: `${i + 1}` }
			}));
		}
		const ordered = items as StimulusItemType[];
		const idx = responseStore.currentIndex;
		const block = blockBoundaries?.find((b) => idx >= b.startIndex && idx <= b.endIndex);
		const slice = block ? ordered.slice(block.startIndex, block.endIndex + 1) : ordered;
		return slice.map((s, i) => {
			if (s.label && Object.values(s.label).some((v) => v && v.length > 0)) {
				return { id: s.id, label: s.label };
			}
			const numeric = String(i + 1);
			return { id: s.id, label: { en: numeric, ja: numeric } };
		});
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
	let breakScreen = $derived((data as Record<string, unknown>).breakScreen as { title?: Record<string, string>; body?: Record<string, string>; duration?: number; disabled?: boolean } | null | undefined);

	let currentBlockInfo = $derived.by(() => {
		if (!blockBoundaries) return null;
		const idx = responseStore.currentIndex;
		const block = blockBoundaries.find(b => idx >= b.startIndex && idx <= b.endIndex);
		if (!block) return null;
		const blockStimIds = items.slice(block.startIndex, block.endIndex + 1).map(s => (s as StimulusItemType).id);
		// Chunk-aware count so anchors don't inflate the block-info counter on
		// chunk entry (a 0/32 block doesn't read 5/32 just because the 5
		// anchors happened to be rated in a previous chunk).
		const completed = blockStimIds.filter(id => chunkCompletion.has(id)).length;
		return {
			blockIndex: blockBoundaries.indexOf(block) + 1,
			totalBlocks: blockBoundaries.length,
			completed,
			total: blockStimIds.length
		};
	});

	/** Pending index to navigate to after break screen is dismissed */
	let pendingBreakIndex = $state(-1);

	// Next-chunk navigation (chunked route, last phase of chunk).
	// Uses the participant's resolved chunk traversal order from server data
	// (`orderedChunkSlugs`, declared earlier near `chunkCompletion`) — NOT the
	// raw `chunks[idx + 1]` order, so latin-square / random-per-participant
	// counterbalancing actually takes effect at chunk boundaries.
	let nextChunkUrl = $derived.by(() => {
		if (!chunkSlug || !config) return null;
		const ordering = orderedChunkSlugs ?? config.stimuli?.chunking?.chunks?.map((c: { slug: string }) => c.slug) ?? [];
		const chunks = config.stimuli?.chunking?.chunks ?? [];
		// "is this OTHER chunk fully complete?" — anchor-aware via the shared
		// `isStimulusDoneInChunk` helper, so anchors require a `_chunk`-tagged
		// response specific to each chunk.
		const itemMap = new Map(config.stimuli?.items?.map((it: { id: string; isAnchor?: boolean }) => [it.id, it]) ?? []);
		const isChunkDone = (chunkSlugLocal: string): boolean => {
			const c = chunks.find((x: { slug: string }) => x.slug === chunkSlugLocal);
			if (!c) return true;
			const allIds = c.blocks.flatMap((b: { stimulusIds?: string[] }) => b.stimulusIds ?? []);
			if (allIds.length === 0) return true;
			return allIds.every((id: string) => {
				const stim = itemMap.get(id) ?? { isAnchor: false };
				const responses = responseStore.byStimulus.get(id) ?? [];
				return isStimulusDoneInChunk(stim, chunkSlugLocal, responses);
			});
		};
		// Bail out unless the CURRENT chunk is done. The "Start next session"
		// banner / completion modal is meaningless mid-chunk, and resolving
		// `nextChunkUrl` while the current chunk is still incomplete causes a
		// chunk-flip loop: the destination chunk's derivation would skip itself
		// and point back at the previous chunk (which is also incomplete), and
		// vice versa, so a still-mounted banner can ping-pong the participant.
		if (!isChunkDone(chunkSlug)) return null;
		// Find the first INCOMPLETE chunk in this participant's ordering, other
		// than the current one. Defends against the participant ending up out
		// of order (e.g. misdirected to a later chunk first).
		for (const slugInOrder of ordering) {
			if (slugInOrder === chunkSlug) continue;
			if (!isChunkDone(slugInOrder)) {
				return `/e/${slug}/c/${slugInOrder}/${config.phases[0]?.slug ?? 'survey'}`;
			}
		}
		return null; // every other chunk is also complete → end of experiment
	});

	let nextChunkCountdownSecs = $state(0);
	let nextChunkTimerInterval: ReturnType<typeof setInterval> | undefined;

	// `CompletionState` lives in CompletionModal.svelte (it's the component's
	// public contract). The phase page imports the type and produces values
	// of it via the derivation below; the modal pattern-matches on `state.kind`.
	let completionState: CompletionState = $derived.by(() => {
		const np = resolveNextPhase();
		if (np) {
			return {
				kind: 'next-phase',
				phase: np,
				customLabel: phase?.completion?.nextPhaseButton ?? null
			};
		}
		if (nextChunkUrl) {
			return nextChunkCountdownSecs > 0
				? { kind: 'next-chunk-cooldown', remainingSecs: nextChunkCountdownSecs }
				: { kind: 'next-chunk-ready', url: nextChunkUrl };
		}
		return { kind: 'finish', customLabel: phase?.completion?.nextPhaseButton ?? null };
	});

	// Title + body resolved as a single derived. `next-phase` uses the
	// per-phase customizable copy; everything chunk-end uses the platform's
	// session-complete strings (with three sub-bodies depending on cooldown
	// state, computed against REMAINING time so a reload mid-cooldown shows
	// the right number).
	let completionCopy = $derived.by(() => {
		// `finish` is the last-chunk / non-chunked end-of-experiment state. Copy
		// must NOT promise a "next session" (the participant is done) — they
		// just need to click Finish to submit. Distinct title + body keys.
		if (completionState.kind === 'finish') {
			return {
				title: i18n.platform('survey.last_chunk_complete_title'),
				body: i18n.platform('survey.last_chunk_complete_body')
			};
		}
		const isAtChunkBoundary =
			completionState.kind === 'next-chunk-cooldown' ||
			completionState.kind === 'next-chunk-ready';
		const title = isAtChunkBoundary
			? i18n.platform('survey.session_complete_title')
			: phase?.completion
				? i18n.localized(phase.completion.title)
				: i18n.platform('survey.completion_title');

		const minBreakMinutes = config?.stimuli?.chunking?.minBreakMinutes ?? 0;
		const remainingMinutes = Math.max(1, Math.ceil(nextChunkCountdownSecs / 60));
		let body: string;
		if (isAtChunkBoundary) {
			if (minBreakMinutes > 0 && nextChunkCountdownSecs > 0) {
				body = i18n.platform('survey.session_complete_body_with_break', {
					duration: formatDuration(remainingMinutes)
				});
			} else if (minBreakMinutes > 0 && nextChunkCountdownSecs === 0) {
				body = i18n.platform('survey.session_complete_body_ready');
			} else {
				body = i18n.platform('survey.session_complete_body');
			}
		} else {
			body = phase?.completion
				? i18n.localized(phase.completion.body)
				: i18n.platform('survey.completion_body');
		}
		return { title, body };
	});

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
	let currentResponses = $derived.by(() => {
		const all = responseStore.byStimulus.get(currentItemId) ?? [];
		if (isReviewPhase) return all;
		// Anchor blinding: hide prior-chunk ratings so the rater gives a
		// fresh judgment — same `inScopeForChunk` semantic the completion
		// check uses.
		return inScopeForChunk(currentStimulusItem ?? { isAnchor: false }, chunkSlug, all);
	});

	// `chunkCompletion` is already filtered to `items`, so its size is the
	// progress count for the current chunk view (F0 fix: was previously
	// `completedStimuli.size`, which is global-across-chunks → 198% bug).
	let completedCount = $derived(chunkCompletion.size);
	// Map from widget id → widget type / localized label, for use in the
	// saved-responses display. Falls back to the raw id when no label is set.
	let widgetTypeMap = $derived(new Map(activeWidgets.map(w => [w.id, w.type])));

	// Compact nav controls (Tier 2.13). The full StimulusNav is collapsed by
	// default; a participant who needs to back-jump expands it via this toggle.
	let navExpanded = $state(false);
	let navAllowed = $derived(
		isReviewPhase ? phase?.reviewConfig?.allowNavigation === true : phase?.allowRevisit !== false
	);
	let currentBlockSlice = $derived.by(() => {
		const idx = responseStore.currentIndex;
		const block = blockBoundaries?.find((b) => idx >= b.startIndex && idx <= b.endIndex);
		if (!block) return { positionInBlock: idx + 1, blockTotal: items.length };
		return {
			positionInBlock: idx - block.startIndex + 1,
			blockTotal: block.endIndex - block.startIndex + 1
		};
	});
	function gotoPrev() {
		navigateToIndex(responseStore.currentIndex - 1);
	}
	function gotoNext() {
		navigateToIndex(responseStore.currentIndex + 1);
	}
	let widgetLabelMap = $derived(
		new Map(activeWidgets.map((w) => [w.id, w.label ? i18n.localized(w.label, w.id) : w.id]))
	);

	type SavedEntry =
		| { kind: 'pair'; widgetId: string; label: string; start: string; end: string }
		| { kind: 'audio'; widgetId: string; label: string; path: string }
		| { kind: 'single'; widgetId: string; label: string; value: string };

	/** Coalesce response_data keys into display entries: timestamp pairs collapse,
	 * audio paths get their own kind, plain text/number values stay as-is. */
	function buildSavedEntries(responseData: Record<string, unknown>): SavedEntry[] {
		const entries: SavedEntry[] = [];
		const consumed = new Set<string>();
		const keys = widgetKeys(responseData);
		for (const key of keys) {
			if (consumed.has(key)) continue;
			const val = responseData[key];
			if (val === null || val === 'null' || val === undefined) continue;
			// Pair detection: a key ending in _start whose sibling _end also exists.
			if (key.endsWith('_start')) {
				const prefix = key.slice(0, -'_start'.length);
				const endKey = `${prefix}_end`;
				const endVal = responseData[endKey];
				if (endVal !== undefined && endVal !== null && endVal !== 'null') {
					const startNum = parseFloat(String(val));
					const endNum = parseFloat(String(endVal));
					entries.push({
						kind: 'pair',
						widgetId: prefix,
						label: widgetLabelMap.get(prefix) ?? prefix,
						start: Number.isFinite(startNum) && startNum >= 0 ? formatTimestamp(startNum) : String(val),
						end: Number.isFinite(endNum) && endNum >= 0 ? formatTimestamp(endNum) : String(endVal)
					});
					consumed.add(key);
					consumed.add(endKey);
					continue;
				}
			}
			if (key.endsWith('_end')) continue; // unmatched _end — skip; will fall through if no pair
			const label = widgetLabelMap.get(key) ?? key;
			if (widgetTypeMap.get(key) === 'audio-recording' && typeof val === 'string') {
				entries.push({ kind: 'audio', widgetId: key, label, path: val });
			} else {
				entries.push({ kind: 'single', widgetId: key, label, value: String(val) });
			}
			consumed.add(key);
		}
		return entries;
	}
</script>

<svelte:head>
	<title>{data.experiment ? i18n.localized(data.experiment.config.metadata.title) : (config ? i18n.localized(config.metadata.title) : 'Survey')}</title>
	{#if nextVideoUrl}<link rel="prefetch" href={nextVideoUrl} />{/if}
</svelte:head>

<Header onLogout={handleLogout} />

{#if welcomeToast}
	<!-- One-shot welcome-back toast (auto-fades after 3 s). Fixed-position so
	     it doesn't shift the page layout. -->
	<div class="fixed top-4 right-4 z-50 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded shadow text-sm">
		{welcomeToast}
	</div>
{/if}

{#if saveErrorToast}
	<!-- Sticky save-error toast (auto-fades after 5 s, click to dismiss). The
	     inline `message` indicator is cleared on the next retry click, so
	     fast retry-flow failures need a separate toast to stay visible. -->
	<button
		type="button"
		onclick={() => { saveErrorToast = null; }}
		class="fixed top-4 right-4 z-50 bg-red-50 border border-red-300 text-red-800 px-4 py-2 rounded shadow text-sm cursor-pointer hover:bg-red-100"
	>
		{saveErrorToast}
	</button>
{/if}

<!-- Mid-chunk re-entry welcome-back screen. Renders once on mount when the
     server's resumeContext indicates this participant left this chunk
     unfinished. Dismissed for the rest of the page session. -->
{#if showResume && resumeContext}
	{@const pct = Math.round((resumeContext.completed / resumeContext.total) * 100)}
	<Modal
		show={showResume}
		title={i18n.platform('survey.welcome_back_title')}
		onclose={() => { resumeDismissed = true; }}
	>
		<p class="text-gray-600 mb-4">
			{i18n.platform('survey.welcome_back_body', {
				pct: String(pct),
				completed: String(resumeContext.completed),
				total: String(resumeContext.total)
			})}
		</p>
		<div class="flex justify-end">
			<button
				type="button"
				class="bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer"
				onclick={() => { resumeDismissed = true; }}
			>
				{i18n.platform('survey.resume_button')}
			</button>
		</div>
	</Modal>
{/if}

<main class="participant-container">
	{#if config && phase && currentItem}
		<!-- Phase title (for review phases) -->
		{#if isReviewPhase && phase.title}
			<h2 class="text-lg font-semibold mb-2">{i18n.localized(phase.title)}</h2>
		{/if}

		<!-- Phase-complete banner (shown after modal is dismissed via "stay on page").
		     During cooldown: a non-clickable live countdown — clicking does nothing
		     (avoids B1's modal-oscillation loop). When cooldown is 0: a clickable
		     button that navigates directly to nextChunkUrl, skipping the modal. -->
		{#if completionModalShown && !showCompletionModal}
			{#if nextChunkUrl && nextChunkCountdownSecs > 0}
				{@const m = Math.floor(nextChunkCountdownSecs / 60)}
				{@const s = nextChunkCountdownSecs % 60}
				<div
					class="w-full mb-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-3 py-2 text-sm"
				>
					<span class="text-amber-800 font-medium">{i18n.platform('survey.completion_title')}</span>
					<span class="text-amber-700 font-mono">
						{i18n.platform('survey.session_complete_resume_in', { time: m > 0 ? `${m}m ${s}s` : `${s}s` })}
					</span>
				</div>
			{:else if nextChunkUrl}
				<button
					type="button"
					onclick={() => { goto(nextChunkUrl!); }}
					class="w-full mb-3 flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded px-3 py-2 text-sm cursor-pointer hover:bg-emerald-100"
				>
					<span class="text-emerald-800 font-medium">{i18n.platform('survey.completion_title')}</span>
					<span class="text-emerald-700">{i18n.platform('survey.start_next_chunk')} →</span>
				</button>
			{:else}
				<!-- No next chunk — just a tiny "complete" indicator that re-opens
				     the modal (the original "stay on page" stayed-state). -->
				<button
					type="button"
					onclick={() => { showCompletionModal = true; }}
					class="w-full mb-3 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded px-3 py-2 text-sm cursor-pointer hover:bg-indigo-100"
				>
					<span class="text-indigo-700 font-medium">{i18n.platform('survey.completion_title')}</span>
					<span class="text-indigo-600">{i18n.platform('survey.finish_experiment')} →</span>
				</button>
			{/if}
		{/if}

		<!-- Progress + block info on a single line -->
		<BlockProgress
			completedCount={completedCount}
			totalItems={items.length}
			{blockBoundaries}
			{currentBlockInfo}
		/>

		<!-- Stimulus / Review item display -->
		<div class="my-3">
			{#if isReviewPhase}
				<ReviewItemDisplay
					sourceResponse={currentItem as ResponseRecord}
					stimuliConfig={config.stimuli}
					stimulusItem={currentStimulusItem ?? undefined}
					stimulusSrc={currentStimulusItem ? (signedUrls[currentStimulusItem.id] || undefined) : undefined}
					{signedUrls}
					replayMode={phase.reviewConfig?.replayMode ?? 'segment'}
					bind:mediaElement
				/>
			{:else}
				<div class="rounded-lg" class:stimulus-highlight={highlightActive}>
					<StimulusRenderer
						item={currentItem as StimulusItemType}
						config={config.stimuli}
						src={currentSrc}
						markers={scrubberMarkers}
						bind:mediaElement
					/>
				</div>
			{/if}
		</div>

		<!-- StimulusNav was moved to BELOW the response widgets (Tier 2.13) so
		     the participant's eye stays on Video → Widgets without 32 buttons
		     of "noise" in between. The full nav is now collapsed-by-default. -->

		<!-- Existing responses for this item — friendlier rendering: widget
		     labels, timestamp pairs collapsed as "label: 0:01.05 → 0:03.50",
		     audio playback inline. -->
		{#if currentResponses.length > 0 && !isReviewPhase}
			<div class="mt-3 p-3 bg-gray-50 rounded border text-sm">
				<p class="font-medium text-gray-700 mb-2">{i18n.platform('common.saved_responses')}</p>
				{#each currentResponses as resp}
					{@const entries = buildSavedEntries(resp.response_data)}
					<div class="mb-1 text-gray-600">
						{#each entries as entry (entry.widgetId)}
							<span class="mr-3">
								<strong>{entry.label}:</strong>
								{#if entry.kind === 'pair'}
									<span class="font-mono">{entry.start} → {entry.end}</span>
								{:else if entry.kind === 'audio'}
									<audio src={signedUrls[entry.path] ?? `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/experiments/${entry.path}`} controls class="inline h-8 w-48 align-middle ml-1"></audio>
								{:else}
									{entry.value}
								{/if}
							</span>
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
			<!-- Defensive UI for the "already answered" state (B3 fix). When a
			     participant manually backs to a stimulus they already responded to
			     with `allowMultipleResponses=false`, both gatekeeper and widgets
			     are intentionally hidden — without this note, the page is silently
			     blank below the video. -->
			{#if !isReviewPhase && !showGatekeeper && !showWidgets && currentResponses.length > 0}
				<div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 text-center">
					{i18n.platform('survey.already_answered')}
				</div>
			{/if}

			<!-- Gatekeeper question (stimulus-response only) -->
			{#if showGatekeeper && gatePrompt && !isReviewPhase}
				<GatekeeperPrompt
					prompt={gatePrompt}
					clicked={gatekeeperClicked}
					{saving}
					onYes={handleYes}
					onNo={handleNo}
				/>
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

		<!-- Compact navigation strip (Tier 2.13). Sits BELOW the widgets so the
		     video → answer reading flow isn't broken by 32 buttons in between.
		     The two phase-type variants share button/strip structure; the only
		     real divergence is the middle counter label, so the caller resolves
		     it once and the component stays free of `{#if isReviewPhase}`. -->
		{#if navAllowed}
			<NavStrip
				label={isReviewPhase
					? `${responseStore.currentIndex + 1} / ${items.length}`
					: i18n.platform('survey.item_position', {
							current: String(currentBlockSlice.positionInBlock),
							total: String(currentBlockSlice.blockTotal)
						})}
				canPrev={responseStore.currentIndex > 0}
				canNext={responseStore.currentIndex < items.length - 1}
				onPrev={gotoPrev}
				onNext={gotoNext}
				expanded={navExpanded}
				onToggle={() => (navExpanded = !navExpanded)}
				items={navItems as StimulusItemType[]}
				activeId={currentItemId}
				completionMap={chunkCompletion}
				onSelectItem={(item) => { handleItemSelect(item); navExpanded = false; }}
			/>
		{/if}

		<!-- For review: show saved reasoning if already completed -->
		{#if isReviewPhase && currentResponses.length > 0}
			<div class="mt-3 p-3 bg-green-50 rounded border border-green-200 text-sm">
				<p class="font-medium text-green-800 mb-2">{i18n.platform('common.saved_responses')}</p>
				{#each currentResponses as resp}
					<div class="mb-1 text-green-700">
						{#each widgetEntries(resp.response_data) as [key, val]}
							{#if val !== 'null' && val !== null}
								<span class="mr-3">
									<strong>{key}:</strong>
									{#if widgetTypeMap.get(key) === 'audio-recording' && typeof val === 'string'}
										<audio src={signedUrls[val] ?? `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/experiments/${val}`} controls class="inline h-8 w-48 align-middle ml-1"></audio>
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

		<!-- Break screen modal (between blocks in chunked experiments). When the
		     researcher hasn't customised title/body, the BreakModal falls through
		     to encouraging platform defaults. `breakScreen.disabled: true` opts
		     out entirely. -->
		{#if !breakScreen?.disabled}
			<BreakModal
				show={showBreakScreen}
				{breakScreen}
				countdown={breakCountdown}
				ondismiss={dismissBreakScreen}
			/>
		{/if}

		<!-- Completion modal. Variants disambiguated by `completionState.kind`
		     in the script; the component is a single switch on `state.kind`.
		     Navigation callbacks stay here (parent owns SvelteKit's `goto`). -->
		<CompletionModal
			show={showCompletionModal}
			state={completionState}
			copy={completionCopy}
			allowStay={phase.allowRevisit !== false}
			stayLabel={phase.completion?.stayButton ?? null}
			onContinue={() => {
				showCompletionModal = false;
				if (completionState.kind === 'next-phase') goto(phaseUrl(completionState.phase.slug));
				else if (completionState.kind === 'next-chunk-ready') goto(completionState.url);
			}}
			onFinish={() => {
				showCompletionModal = false;
				window.location.href = `/e/${slug}/complete`;
			}}
			onStay={() => (showCompletionModal = false)}
			onClose={() => (showCompletionModal = false)}
		/>

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
