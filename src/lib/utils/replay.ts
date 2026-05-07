/**
 * Shared media replay controller — used by both the timestamp-range widget
 * (inline review button) and the review phase (ReviewItemDisplay).
 */

export interface ReplayController {
	replaySegment(media: HTMLMediaElement, start: number, end: number): void;
	replayFullWithHighlight(
		media: HTMLMediaElement,
		start: number,
		end: number,
		onHighlight: (active: boolean) => void
	): void;
	cleanup(media: HTMLMediaElement): void;
}

export function createReplayController(): ReplayController {
	let activeCleanup: (() => void) | null = null;

	function clearActive() {
		if (activeCleanup) {
			activeCleanup();
			activeCleanup = null;
		}
	}

	return {
		replaySegment(media, start, end) {
			clearActive();
			media.currentTime = start;
			media.play();

			// `seeking` fires once for the initial currentTime assignment above.
			// Skip that one event; any subsequent `seeking` event is a user scrub
			// and means the segment intent is over, so abandon the replay.
			let initialSeekConsumed = false;

			const onTimeUpdate = () => {
				if (media.currentTime >= end) {
					media.pause();
					clearActive();
				}
			};
			const onSeeking = () => {
				if (!initialSeekConsumed) { initialSeekConsumed = true; return; }
				clearActive();
			};

			activeCleanup = () => {
				media.removeEventListener('timeupdate', onTimeUpdate);
				media.removeEventListener('seeking', onSeeking);
			};
			media.addEventListener('timeupdate', onTimeUpdate);
			media.addEventListener('seeking', onSeeking);
		},

		replayFullWithHighlight(media, start, end, onHighlight) {
			clearActive();
			onHighlight(false);
			media.currentTime = 0;
			media.play();

			let initialSeekConsumed = false;
			let cancelled = false;
			let rafId: number | null = null;

			const updateHighlight = () => {
				const t = media.currentTime;
				onHighlight(t >= start && t <= end);
			};
			// `timeupdate` fires at only ~4 Hz, so driving the ring from it
			// alone makes a 1-second highlighted range flicker on for ~250 ms
			// instead of the full duration. rAF gives ~60 Hz updates so the
			// ring stays visually synced with `currentTime`. `timeupdate` is
			// still wired up for end-of-playback detection (rAF stops when the
			// tab is hidden, but `ended` always fires).
			const tick = () => {
				if (cancelled) return;
				updateHighlight();
				rafId = requestAnimationFrame(tick);
			};
			const onTimeUpdate = () => {
				updateHighlight();
				if (media.ended) {
					onHighlight(false);
					clearActive();
				}
			};
			const onSeeking = () => {
				if (!initialSeekConsumed) { initialSeekConsumed = true; return; }
				onHighlight(false);
				clearActive();
			};

			activeCleanup = () => {
				cancelled = true;
				if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
				media.removeEventListener('timeupdate', onTimeUpdate);
				media.removeEventListener('seeking', onSeeking);
			};
			media.addEventListener('timeupdate', onTimeUpdate);
			media.addEventListener('seeking', onSeeking);
			// rAF is browser-only; in node-based tests this branch is skipped
			// and the `timeupdate` listener still drives the highlight.
			if (typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(tick);
		},

		cleanup() {
			clearActive();
		}
	};
}
