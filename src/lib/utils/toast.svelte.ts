type ToastType = 'success' | 'error';
export type ToastEntry = { type: ToastType; message: string };

/**
 * Per-component toast state. Holds at most one active toast (later calls
 * replace the previous one and reset the timer) — matches the per-page
 * `let toast = $state<...>(null); setTimeout(... null, 3000)` pattern that
 * was duplicated across every admin page before consolidation.
 *
 * Stacking and global positioning are deliberately out of scope: this is a
 * pure refactor of the existing inline pattern, not a UX redesign.
 */
export class ToastState {
	current = $state<ToastEntry | null>(null);
	#timer: ReturnType<typeof setTimeout> | null = null;

	show(type: ToastType, message: string, durationMs = 3000): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.current = { type, message };
		this.#timer = setTimeout(() => {
			this.current = null;
			this.#timer = null;
		}, durationMs);
	}
}
