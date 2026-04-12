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
	let activeListener: ((e: Event) => void) | null = null;

	function clearListener(media: HTMLMediaElement) {
		if (activeListener) {
			media.removeEventListener('timeupdate', activeListener);
			activeListener = null;
		}
	}

	return {
		replaySegment(media, start, end) {
			clearListener(media);
			media.currentTime = start;
			media.play();
			const onTimeUpdate = () => {
				if (media.currentTime >= end) {
					media.pause();
					clearListener(media);
				}
			};
			activeListener = onTimeUpdate;
			media.addEventListener('timeupdate', onTimeUpdate);
		},

		replayFullWithHighlight(media, start, end, onHighlight) {
			clearListener(media);
			onHighlight(false);
			media.currentTime = 0;
			media.play();
			const onTimeUpdate = () => {
				const t = media.currentTime;
				onHighlight(t >= start && t <= end);
				if (media.ended) {
					onHighlight(false);
					clearListener(media);
				}
			};
			activeListener = onTimeUpdate;
			media.addEventListener('timeupdate', onTimeUpdate);
		},

		cleanup(media) {
			clearListener(media);
		}
	};
}
