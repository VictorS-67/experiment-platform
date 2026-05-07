<script lang="ts" module>
	export type ScrubberMarker = {
		/** Time in seconds where the marker is drawn. */
		at: number;
		/** Optional ARIA label (e.g. "start", "end"). */
		label?: string;
		/** CSS color override. Defaults to indigo. */
		color?: string;
	};
</script>

<script lang="ts">
	import { formatTimestamp } from '$lib/utils/time-format';

	type Props = {
		media: HTMLMediaElement | undefined;
		markers?: ScrubberMarker[];
	};

	let { media, markers = [] }: Props = $props();

	let currentTime = $state(0);
	let duration = $state(0);
	let playing = $state(false);
	let isReady = $derived(duration > 0 && Number.isFinite(duration));

	// Drag-state machine for the seek pipeline (Bug: fast scrub froze the
	// video frame in Chrome). Calling fastSeek on every oninput floods the
	// decoder; each new request cancels the previous one, none ever finish,
	// the frame stays still until the user stops. We coalesce: only one seek
	// is ever in flight; subsequent inputs update `pendingSeek`, and we issue
	// the next seek only after `seeked` fires for the previous one. The
	// scrubber thus tracks the user's cursor as fast as the decoder allows.
	let isDragging = $state(false);
	let pendingSeek: number | null = null;
	let seekInFlight = false;
	// Cleanup hook for the in-flight `seeked` listener. Captured so the
	// $effect below can detach it if `media` changes mid-seek (otherwise the
	// stale listener might fire flushPendingSeek against the new element).
	let pendingSeekedCleanup: (() => void) | null = null;

	// Wire ourselves to whatever media element the parent is binding. Re-runs
	// when `media` changes (e.g. parent re-mounts the <video> on stimulus
	// change). The effect's cleanup detaches the previous element's listeners.
	$effect(() => {
		const m = media;
		if (!m) return;

		// Initial state from the element (covers late-mount where the element
		// already has metadata before our listeners attach).
		currentTime = m.currentTime || 0;
		duration = m.duration || 0;
		playing = !m.paused;

		const onLoadedMeta = () => { duration = m.duration || 0; };
		const onDurationChange = () => { duration = m.duration || 0; };
		const onTimeUpdate = () => {
			// While the user is actively dragging the slider, don't let
			// timeupdate snap the slider position back to where the decoder
			// landed — that would make the thumb visibly jitter behind the
			// cursor on fast scrubs.
			if (isDragging) return;
			currentTime = m.currentTime || 0;
		};
		const onPlay = () => { playing = true; };
		const onPause = () => { playing = false; };
		const onEnded = () => { playing = false; };

		m.addEventListener('loadedmetadata', onLoadedMeta);
		m.addEventListener('durationchange', onDurationChange);
		m.addEventListener('timeupdate', onTimeUpdate);
		m.addEventListener('play', onPlay);
		m.addEventListener('pause', onPause);
		m.addEventListener('ended', onEnded);
		return () => {
			m.removeEventListener('loadedmetadata', onLoadedMeta);
			m.removeEventListener('durationchange', onDurationChange);
			m.removeEventListener('timeupdate', onTimeUpdate);
			m.removeEventListener('play', onPlay);
			m.removeEventListener('pause', onPause);
			m.removeEventListener('ended', onEnded);
			// Drop any in-flight seek listener and reset the seek pipeline so
			// a delayed `seeked` event from the previous media doesn't trip
			// flushPendingSeek against the next one.
			if (pendingSeekedCleanup) { pendingSeekedCleanup(); pendingSeekedCleanup = null; }
			pendingSeek = null;
			seekInFlight = false;
			isDragging = false;
		};
	});

	function togglePlay() {
		if (!media || !isReady) return;
		if (media.paused) media.play().catch(() => { /* user-gesture rejection — ignore */ });
		else media.pause();
	}

	function flushPendingSeek() {
		// Capture media so the seeked-handler closure binds to the element
		// we attached to — even if `media` swaps to a new element before the
		// decoder responds, this listener stays scoped to the original.
		const m = media;
		if (!m || pendingSeek === null) return;
		const target = pendingSeek;
		pendingSeek = null;
		seekInFlight = true;

		const onSeeked = () => {
			m.removeEventListener('seeked', onSeeked);
			pendingSeekedCleanup = null;
			seekInFlight = false;
			// If the user kept dragging while this seek was decoding, fire
			// the next one immediately. Otherwise the pipeline is idle.
			if (pendingSeek !== null) flushPendingSeek();
		};
		pendingSeekedCleanup = () => m.removeEventListener('seeked', onSeeked);
		m.addEventListener('seeked', onSeeked);

		// fastSeek (Chrome/Safari) decodes to the nearest keyframe — fast
		// enough to keep up while dragging. Firefox lacks fastSeek; precise
		// seek is slower but still works.
		const fastSeek = (m as HTMLMediaElement & { fastSeek?: (t: number) => void }).fastSeek;
		if (typeof fastSeek === 'function') fastSeek.call(m, target);
		else m.currentTime = target;
	}

	function handleInput(e: Event) {
		if (!media || !isReady) return;
		isDragging = true;
		pendingSeek = (e.currentTarget as HTMLInputElement).valueAsNumber;
		// Coalesce: only kick off a new seek if the pipeline is idle. If a
		// seek is in flight, flushPendingSeek will pick up the latest target
		// when the current one finishes.
		if (!seekInFlight) flushPendingSeek();
	}

	// On release, do a precise seek so a subsequent "Set start"/"Set end"
	// captures the exact frame the participant let go on (not the last
	// keyframe fastSeek landed on). Also clears the dragging flag so future
	// timeupdate events resume driving the slider.
	function handleChange(e: Event) {
		isDragging = false;
		if (!media || !isReady) return;
		// Clear any pending coalesced seek — the precise seek below replaces
		// it.
		pendingSeek = null;
		media.currentTime = (e.currentTarget as HTMLInputElement).valueAsNumber;
	}

	function handleWrapperKeydown(e: KeyboardEvent) {
		// Space-to-play when focus isn't on the slider (the slider's own Space
		// behaviour — page up — should be preserved when it's focused).
		if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
			e.preventDefault();
			togglePlay();
		}
	}

	const displayDuration = $derived(isReady ? formatTimestamp(duration) : '--:--');
	const displayCurrent = $derived(
		Number.isFinite(currentTime) && currentTime >= 0 ? formatTimestamp(currentTime) : '0:00.00'
	);
	// Slider position as a unitless percent for the progress-fill calc.
	// Width math lives in CSS (using --thumb-w) so the thumb size has a
	// single source of truth — see the style block.
	const progressPercent = $derived(isReady ? (currentTime / duration) * 100 : 0);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions —
     `role="group"` is documented as non-interactive, but in practice we want
     Space-to-play to work whenever the player container has focus, even when
     the focused child isn't the slider. Real interactive children (the
     play/pause button + the slider) are inside this group. -->
<div
	class="flex items-center gap-3 px-3 py-2 bg-gray-900 text-gray-100 text-sm select-none"
	style="--thumb-w: 14px"
	role="group"
	aria-label="Media playback controls"
	onkeydown={handleWrapperKeydown}
>
	<button
		type="button"
		onclick={togglePlay}
		disabled={!isReady}
		aria-label={playing ? 'Pause' : 'Play'}
		class="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
	>
		{#if playing}
			<!-- Pause -->
			<svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" aria-hidden="true">
				<rect x="6" y="5" width="4" height="14" rx="1" />
				<rect x="14" y="5" width="4" height="14" rx="1" />
			</svg>
		{:else}
			<!-- Play -->
			<svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" aria-hidden="true">
				<path d="M8 5l11 7-11 7V5z" />
			</svg>
		{/if}
	</button>

	<span class="font-mono text-xs tabular-nums w-16 text-right" aria-label="Current time">{displayCurrent}</span>

	<div class="relative flex-1 h-6 flex items-center">
		<!-- Visible track underlay. Pointer-events:none on every overlay so
		     the input on top stays the only interactive layer. -->
		<div class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/20 pointer-events-none"></div>
		<!-- Progress fill. Width is calc-adjusted (see <style>) so it ends at
		     the thumb's centre rather than the track's right edge — otherwise
		     the fill would visibly cross over the thumb as the value
		     approached max. --p is the only dynamic input; thumb width lives
		     in --thumb-w on the wrapper. -->
		<div
			class="progress-fill absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-indigo-400 pointer-events-none"
			style="--p: {progressPercent}"
		></div>

		<!-- Markers (e.g. participant's saved start/end). Read-only visual
		     overlay, never intercepts pointer events. -->
		{#if isReady && markers.length > 0}
			{#each markers as m, i (i)}
				{#if Number.isFinite(m.at) && m.at >= 0 && m.at <= duration}
					<div
						class="absolute top-0 bottom-0 w-[3px] rounded pointer-events-none"
						style="left: {(m.at / duration) * 100}%; transform: translateX(-50%); background: {m.color ?? 'rgb(250 204 21)'};"
						aria-label={m.label ? `${m.label} marker at ${formatTimestamp(m.at)}` : undefined}
						title={m.label ? `${m.label}: ${formatTimestamp(m.at)}` : formatTimestamp(m.at)}
					></div>
				{/if}
			{/each}
		{/if}

		<!-- Slider input rendered LAST so its native thumb stacks above the
		     progress fill (default DOM order = paint order when z-index auto).
		     Browser's native <input type="range"> keeps keyboard handling
		     (←/→/Home/End/PgUp/PgDn) for free. -->
		<input
			type="range"
			min="0"
			max={isReady ? duration : 0}
			step="0.01"
			bind:value={currentTime}
			oninput={handleInput}
			onchange={handleChange}
			disabled={!isReady}
			aria-label="Seek"
			class="absolute inset-0 w-full h-6 appearance-none bg-transparent cursor-pointer disabled:cursor-not-allowed accent-indigo-500"
		/>
	</div>

	<span class="font-mono text-xs tabular-nums w-16 text-left" aria-label="Total duration">{displayDuration}</span>
</div>

	<style>
		/* Width formula derivation: native range inputs anchor the thumb's
		 * right edge to the track's right edge at max (not the thumb's
		 * centre). A plain `width: var(--p)%` fill therefore overshoots the
		 * thumb's centre by half --thumb-w as --p grows. Compensate so the
		 * fill always ends exactly at the thumb's centre.
		 *   at --p = 0   → 0% - 0px + 7px              = 7px
		 *   at --p = 100 → 100% - 14px + 7px           = 100% - 7px
		 */
		.progress-fill {
			width: calc(var(--p) * 1% - var(--p) * var(--thumb-w) / 100 + var(--thumb-w) / 2);
		}

		/* Style the native range thumb to a clear circle on a thin track. The
		   visible track is rendered separately above so we keep the input fully
		   transparent and rely on its hit area for interaction. */
		input[type='range']::-webkit-slider-thumb {
			appearance: none;
			width: var(--thumb-w);
			height: var(--thumb-w);
			border-radius: 9999px;
			background: white;
			border: 2px solid rgb(99 102 241);
			cursor: pointer;
		}
		input[type='range']:disabled::-webkit-slider-thumb {
			background: rgb(156 163 175);
			border-color: rgb(75 85 99);
			cursor: not-allowed;
		}
		input[type='range']::-moz-range-thumb {
			width: var(--thumb-w);
			height: var(--thumb-w);
			border-radius: 9999px;
			background: white;
			border: 2px solid rgb(99 102 241);
			cursor: pointer;
		}
	input[type='range']::-webkit-slider-runnable-track {
		background: transparent;
	}
	input[type='range']::-moz-range-track {
		background: transparent;
	}
	input[type='range']:focus {
		outline: none;
	}
	input[type='range']:focus-visible::-webkit-slider-thumb {
		box-shadow: 0 0 0 3px rgb(99 102 241 / 0.4);
	}
	input[type='range']:focus-visible::-moz-range-thumb {
		box-shadow: 0 0 0 3px rgb(99 102 241 / 0.4);
	}
</style>
