import { describe, it, expect } from 'vitest';
import { mapSide, pickSide, PLAYER_SELECTOR } from './tutorial-placement';

describe('mapSide', () => {
	it('passes through valid sides', () => {
		expect(mapSide('top')).toBe('top');
		expect(mapSide('bottom')).toBe('bottom');
		expect(mapSide('left')).toBe('left');
		expect(mapSide('right')).toBe('right');
	});

	it('falls back to bottom for unknown values', () => {
		expect(mapSide('above')).toBe('bottom');
		expect(mapSide('')).toBe('bottom');
		expect(mapSide('TOP')).toBe('bottom'); // case-sensitive
	});
});

describe('pickSide', () => {
	// Bug context (regression test): Tutorial steps targeting the stimulus
	// player are configured `position: bottom` in the experiment JSON, but
	// `#stimulus-player` wraps the video AND the scrubber — placing the
	// popover on the bottom side overlaps the (interactive) scrubber. We
	// force `top` instead so the popover only overlaps the (passive) video
	// frame. If this rule regresses, narrow-viewport tutorials become
	// unusable because the participant can't see/use the scrubber the
	// tutorial is asking them to operate.
	it('overrides bottom→top when targeting the stimulus player', () => {
		expect(pickSide(PLAYER_SELECTOR, 'bottom')).toBe('top');
	});

	it('passes other sides through unchanged for the stimulus player', () => {
		expect(pickSide(PLAYER_SELECTOR, 'top')).toBe('top');
		expect(pickSide(PLAYER_SELECTOR, 'left')).toBe('left');
		expect(pickSide(PLAYER_SELECTOR, 'right')).toBe('right');
	});

	it('does not touch other selectors', () => {
		expect(pickSide('#gatekeeper-yes', 'bottom')).toBe('bottom');
		expect(pickSide('#start-time-btn', 'bottom')).toBe('bottom');
		expect(pickSide('#some-other-element', 'top')).toBe('top');
	});
});
