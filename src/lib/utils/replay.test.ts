import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReplayController } from './replay';

function createMockMedia() {
	let _currentTime = 0;
	let _playing = false;
	const listeners = new Map<string, Set<Function>>();

	const media = {
		get currentTime() { return _currentTime; },
		set currentTime(v: number) { _currentTime = v; },
		get ended() { return false; },
		play: vi.fn(() => { _playing = true; }),
		pause: vi.fn(() => { _playing = false; }),
		addEventListener: vi.fn((event: string, handler: Function) => {
			if (!listeners.has(event)) listeners.set(event, new Set());
			listeners.get(event)!.add(handler);
		}),
		removeEventListener: vi.fn((event: string, handler: Function) => {
			listeners.get(event)?.delete(handler);
		}),
		// Test helper: simulate time update
		_simulateTimeUpdate(time: number) {
			_currentTime = time;
			for (const handler of listeners.get('timeupdate') ?? []) {
				handler();
			}
		}
	};
	return media as unknown as HTMLMediaElement & { _simulateTimeUpdate: (t: number) => void };
}

describe('createReplayController', () => {
	let media: ReturnType<typeof createMockMedia>;
	let controller: ReturnType<typeof createReplayController>;

	beforeEach(() => {
		media = createMockMedia();
		controller = createReplayController();
	});

	describe('replaySegment', () => {
		it('sets currentTime and plays', () => {
			controller.replaySegment(media, 5.0, 10.0);
			expect(media.currentTime).toBe(5.0);
			expect(media.play).toHaveBeenCalled();
		});

		it('pauses when time reaches end', () => {
			controller.replaySegment(media, 5.0, 10.0);
			media._simulateTimeUpdate(9.0);
			expect(media.pause).not.toHaveBeenCalled();
			media._simulateTimeUpdate(10.0);
			expect(media.pause).toHaveBeenCalled();
		});

		it('removes listener after pausing', () => {
			controller.replaySegment(media, 5.0, 10.0);
			media._simulateTimeUpdate(10.0);
			expect(media.removeEventListener).toHaveBeenCalledWith('timeupdate', expect.any(Function));
		});
	});

	describe('replayFullWithHighlight', () => {
		it('starts from beginning', () => {
			const onHighlight = vi.fn();
			controller.replayFullWithHighlight(media, 3.0, 7.0, onHighlight);
			expect(media.currentTime).toBe(0);
			expect(media.play).toHaveBeenCalled();
		});

		it('calls onHighlight(true) within range', () => {
			const onHighlight = vi.fn();
			controller.replayFullWithHighlight(media, 3.0, 7.0, onHighlight);
			media._simulateTimeUpdate(5.0);
			expect(onHighlight).toHaveBeenCalledWith(true);
		});

		it('calls onHighlight(false) outside range', () => {
			const onHighlight = vi.fn();
			controller.replayFullWithHighlight(media, 3.0, 7.0, onHighlight);
			media._simulateTimeUpdate(1.0);
			// First call is onHighlight(false) from initialization, then from timeupdate
			expect(onHighlight).toHaveBeenCalledWith(false);
		});

		it('highlights at exact boundaries', () => {
			const onHighlight = vi.fn();
			controller.replayFullWithHighlight(media, 3.0, 7.0, onHighlight);
			onHighlight.mockClear();
			media._simulateTimeUpdate(3.0);
			expect(onHighlight).toHaveBeenCalledWith(true);
			onHighlight.mockClear();
			media._simulateTimeUpdate(7.0);
			expect(onHighlight).toHaveBeenCalledWith(true);
		});
	});

	describe('cleanup', () => {
		it('removes active listener', () => {
			controller.replaySegment(media, 0, 10);
			controller.cleanup(media);
			expect(media.removeEventListener).toHaveBeenCalledWith('timeupdate', expect.any(Function));
		});

		it('is safe to call when no listener is active', () => {
			expect(() => controller.cleanup(media)).not.toThrow();
		});
	});

	describe('multiple replays', () => {
		it('cancels previous replay when starting a new one', () => {
			controller.replaySegment(media, 0, 5);
			const removeCalls = (media.removeEventListener as ReturnType<typeof vi.fn>).mock.calls.length;
			controller.replaySegment(media, 10, 20);
			// Should have removed the previous listener
			expect((media.removeEventListener as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(removeCalls);
		});
	});
});
