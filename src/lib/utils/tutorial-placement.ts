/**
 * Side-picking helpers for the Driver.js-powered tutorial overlay.
 *
 * These rules live in their own module so they can be unit-tested without
 * mounting a Svelte component or Driver.js. The runtime overlay logic that
 * sniffs Driver.js's `arrow-none` class stays inside the component (it
 * inspects live DOM).
 */

export type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * The id rendered by StimulusRenderer / VideoPlayer that wraps the video
 * frame AND the custom scrubber. Several placement rules below depend on
 * the target being this specific element so the constant lives here as a
 * single source of truth.
 */
export const PLAYER_SELECTOR = '#stimulus-player';

/**
 * Coerce a config string to a strict Side enum, defaulting to `bottom` for
 * unrecognised values. Driver.js accepts only the four cardinal sides.
 */
export function mapSide(position: string): Side {
	if (['top', 'bottom', 'left', 'right'].includes(position)) {
		return position as Side;
	}
	return 'bottom';
}

/**
 * Override the configured side for known-conflicting targets. Tutorial
 * steps that target the player are configured `bottom`, but the bottom of
 * the player is the (interactive) scrubber. Force `top` instead so the
 * popover overlaps only the (passive) video frame.
 *
 * Driver.js's own fallback when `top` doesn't fit either is handled at
 * runtime by `maybeOverlayPopoverOnPlayerTop` (which sniffs Driver.js's
 * `arrow-none` class and pins the popover to the viewport top). That
 * inspects live DOM and is therefore not testable here.
 */
export function pickSide(targetSelector: string, configured: Side): Side {
	if (targetSelector === PLAYER_SELECTOR && configured === 'bottom') return 'top';
	return configured;
}
