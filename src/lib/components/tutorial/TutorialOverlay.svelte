<script lang="ts">
	import 'driver.js/dist/driver.css';
	import { onMount } from 'svelte';
	import type { TutorialConfigType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';
	import { mapSide, pickSide, PLAYER_SELECTOR } from '$lib/utils/tutorial-placement';

	let {
		config,
		oncomplete
	}: {
		config: TutorialConfigType;
		oncomplete: () => void;
	} = $props();

	type Phase = 'intro' | 'welcome' | 'steps' | 'completion';

	// svelte-ignore state_referenced_locally -- initial phase depends on config
	// at mount; later config changes shouldn't reset the user mid-tutorial.
	let phase = $state<Phase>(config.introduction ? 'intro' : 'welcome');

	// Tracks whether the JS bundle has loaded and the component has mounted.
	// `false` in SSR HTML so the Continue / Begin Tutorial buttons render in a
	// disabled "Loading…" state until JS hydrates. Without this, on a slow
	// connection the participant can read the SSR-rendered intro modal,
	// click the button before hydration, and see nothing happen — the click
	// handler doesn't exist yet.
	let hydrated = $state(false);
	// True while `beginTutorial()` is awaiting the dynamic `driver.js` import.
	// Keeps the welcome modal visible with a spinner so the participant has
	// feedback during the chunk download (~1–4 s on Slow 3G).
	let starting = $state(false);

	// Driver.js instance and validation state (not reactive — managed imperatively)
	let driverInstance: ReturnType<typeof import('driver.js').driver> | null = null;
	let currentIndex = 0;
	let stepValidated = false;
	let validationCleanup: (() => void) | null = null;

	function cleanupValidation() {
		if (validationCleanup) {
			validationCleanup();
			validationCleanup = null;
		}
	}

	// Greys out or re-enables the Driver.js Next/Done button based on stepValidated
	function updateNextButtonState() {
		const btns = document.querySelectorAll<HTMLButtonElement>(
			'.driver-popover-next-btn, .driver-popover-done-btn'
		);
		btns.forEach((btn) => {
			if (stepValidated) {
				btn.removeAttribute('data-validation-blocked');
			} else {
				btn.setAttribute('data-validation-blocked', 'true');
			}
		});
	}

	function advance() {
		if (!driverInstance) return;
		cleanupValidation();
		stepValidated = false;
		if (driverInstance.isLastStep()) {
			driverInstance.destroy();
		} else {
			currentIndex++; // update before moveNext so onHighlighted sees the correct index
			driverInstance.moveNext();
		}
	}

	function setupValidation(stepConfig: (typeof config.steps)[number]) {
		cleanupValidation();

		const validation = stepConfig.validation;
		if (!validation || validation.type === 'none') {
			stepValidated = true;
			return;
		}

		stepValidated = false;

		const targetSelector = validation.target ?? stepConfig.targetSelector;
		const target = document.querySelector(targetSelector);

		if (!target) {
			stepValidated = true;
			return;
		}

		const markValidated = () => {
			stepValidated = true;
			updateNextButtonState();
			if (stepConfig.autoAdvance) setTimeout(() => advance(), 400);
		};

		if (validation.type === 'click') {
			const handler = () => {
				if (stepValidated) return;
				markValidated();
			};
			target.addEventListener('click', handler);
			// Native video/audio controls (play button, seek bar) live in the browser's shadow UI
			// and don't fire click events that bubble to the DOM. Listen to media events as a fallback.
			const media = target.matches('video, audio')
				? target
				: target.querySelector('video, audio');
			const mediaEvents = ['play', 'pause', 'seeking'] as const;
			if (media) {
				for (const ev of mediaEvents) media.addEventListener(ev, handler);
			}
			validationCleanup = () => {
				target.removeEventListener('click', handler);
				if (media) {
					for (const ev of mediaEvents) media.removeEventListener(ev, handler);
				}
			};
		} else if (validation.type === 'input') {
			const handler = () => {
				if (stepValidated) return;
				const el = target as HTMLInputElement | HTMLTextAreaElement;
				if (el.value?.trim().length > 0) markValidated();
			};
			target.addEventListener('input', handler);
			validationCleanup = () => target.removeEventListener('input', handler);
		} else if (validation.type === 'play') {
			const media = target.querySelector('video, audio') ?? target;
			const handler = () => {
				if (stepValidated) return;
				markValidated();
			};
			media.addEventListener('play', handler);
			validationCleanup = () => media.removeEventListener('play', handler);
		}
	}

	// When the player is too tall AND too wide for the popover to fit on any
	// side, Driver.js falls back to a viewport-centered placement (signalled
	// by the `driver-popover-arrow-none` class on the arrow element). On the
	// player that fallback lands overlapping the scrubber. Override: pin the
	// popover to the top of the viewport so it overlays only the upper slice
	// of the video frame, leaving the scrubber visible and clickable.
	function maybeOverlayPopoverOnPlayerTop() {
		if (typeof window === 'undefined') return;
		const step = config.steps[currentIndex];
		if (!step || step.targetSelector !== PLAYER_SELECTOR) return;
		const popover = document.querySelector('.driver-popover') as HTMLElement | null;
		const arrow = document.querySelector('.driver-popover-arrow') as HTMLElement | null;
		const target = document.querySelector(step.targetSelector) as HTMLElement | null;
		if (!popover || !target) return;
		// Only override when Driver.js gave up on side placement (its sentinel
		// for that case). When a clean side does fit, leave Driver.js's
		// placement alone.
		if (!arrow?.classList.contains('driver-popover-arrow-none')) return;

		const tr = target.getBoundingClientRect();
		const pr = popover.getBoundingClientRect();
		const VIEWPORT_PADDING = 8;

		// Pin to the top of the viewport, centered horizontally on the
		// player. The scrubber sits at the bottom of the player so this
		// leaves it clear regardless of how tall the player happens to be.
		const desiredLeft = tr.left + tr.width / 2 - pr.width / 2;
		const left = Math.max(VIEWPORT_PADDING, Math.min(desiredLeft, window.innerWidth - pr.width - VIEWPORT_PADDING));
		popover.style.position = 'fixed';
		popover.style.left = `${left}px`;
		popover.style.top = `${VIEWPORT_PADDING}px`;
		popover.style.right = '';
		popover.style.bottom = '';
		popover.style.transform = '';
	}

	async function beginTutorial() {
		// Load driver.js BEFORE flipping `phase` so the welcome modal stays
		// visible (with a spinner via `starting`) during the chunk fetch. The
		// previous order — flip phase, then await import — left the screen
		// blank with no feedback for ~1–4 s on Slow 3G.
		starting = true;

		let driver: typeof import('driver.js').driver;
		try {
			({ driver } = await import('driver.js'));
		} catch (err) {
			console.error('Failed to load tutorial runtime:', err);
			starting = false;
			return;
		}

		const steps = config.steps.map((step) => {
			let description = i18n.localized(step.body);
			if (step.instruction) {
				description += `<p style="color:#4f46e5;font-weight:500;margin-top:0.5rem;">${i18n.localized(step.instruction)}</p>`;
			}
			return {
				element: step.targetSelector,
				popover: {
					title: i18n.localized(step.title),
					description,
					side: pickSide(step.targetSelector, mapSide(step.position)),
					align: 'center' as const
				}
			};
		});

		currentIndex = 0;
		stepValidated = false;

		// Now we have driver.js — flip to steps phase and unmount the welcome
		// modal, then drive on the next frame so the survey UI is visible.
		phase = 'steps';
		starting = false;
		await new Promise((r) => requestAnimationFrame(r));

		driverInstance = driver({
			steps,
			showProgress: true,
			progressText: `${i18n.platform('tutorial.progress')} {{current}} ${i18n.platform('common.of')} {{total}}`,
			nextBtnText: i18n.platform('tutorial.next'),
			prevBtnText: i18n.platform('tutorial.previous'),
			doneBtnText: i18n.platform('tutorial.finish'),
			allowClose: false,
			stagePadding: 10,
			stageRadius: 8,
			overlayOpacity: 0.5,
			// Disable Driver.js's 200 ms fade-in animation. The animation runs
			// from opacity:0 → opacity:1 and overrides our inline opacity:0
			// while it's playing, which made the popover briefly visible at
			// Driver.js's pre-reposition placement. With animate:false the
			// CSS readiness gate (see the style block below) fully controls
			// visibility.
			animate: false,
			onPopoverRender: (popover) => {
				// Each step transition reuses the same popover element, so
				// drop the readiness marker — the global CSS rule then hides
				// the popover until onHighlighted re-applies it after our
				// reposition. Without this, step 2+ would be visible at
				// their intermediate placement before our fix runs.
				popover.wrapper.removeAttribute('data-tutorial-ready');
			},
			onHighlighted: () => {
				// Fires after Driver.js has fully rendered the popover — safe to update the button
				setupValidation(config.steps[currentIndex]);
				updateNextButtonState();
				// When Driver.js can't fit the popover on any side of the target
				// it falls back to a viewport-centered "no-arrow" placement,
				// which lands on the bottom of #stimulus-player — i.e. on top of
				// the (interactive) scrubber. Detect that case and manually
				// reposition the popover to the top of the viewport (over the
				// passive video frame, leaving the scrubber visible/clickable).
				maybeOverlayPopoverOnPlayerTop();
				// Reveal the popover now that its final position is set. The
				// CSS rule keyed on this attribute is what actually flips
				// opacity from 0 → 1 (see the style block below).
				const popover = document.querySelector('.driver-popover') as HTMLElement | null;
				if (popover) popover.setAttribute('data-tutorial-ready', 'true');
			},
			onNextClick: () => {
				const stepConfig = config.steps[currentIndex];
				const v = stepConfig?.validation;
				if (v && v.type !== 'none' && !stepValidated) return;
				advance();
			},
			onPrevClick: () => {
				if (currentIndex <= 0) return;
				cleanupValidation();
				stepValidated = false;
				currentIndex--; // update before movePrevious so onHighlighted sees the correct index
				driverInstance!.movePrevious();
			},
			onDestroyed: () => {
				cleanupValidation();
				driverInstance = null;
				phase = 'completion';
			}
		});

		driverInstance.drive();
	}

	function proceedFromIntro() {
		phase = 'welcome';
	}

	function skip() {
		oncomplete();
	}

	function finish() {
		oncomplete();
	}

	// Cleanup on unmount + flip `hydrated` so SSR-rendered "Loading…" buttons
	// switch to their normal interactive state.
	onMount(() => {
		hydrated = true;
		return () => {
			cleanupValidation();
			if (driverInstance) {
				try {
					driverInstance.destroy();
				} catch {
					/* already destroyed */
				}
				driverInstance = null;
			}
		};
	});
</script>

{#if phase === 'intro' && config.introduction}
	<div class="tutorial-overlay">
		<div class="tutorial-modal">
			<h2 class="text-xl font-semibold mb-3">{i18n.localized(config.introduction.title)}</h2>
			<p class="text-gray-600 mb-6" style="white-space: pre-line;">{i18n.localized(config.introduction.body)}</p>
			<button
				class="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer font-medium disabled:bg-indigo-400 disabled:cursor-wait flex items-center justify-center gap-2"
				onclick={proceedFromIntro}
				disabled={!hydrated}
				aria-busy={!hydrated}
			>
				{#if !hydrated}
					<span class="spinner w-4 h-4 inline-block"></span>
					{i18n.platform('common.loading')}
				{:else}
					{i18n.localized(config.introduction.buttonText ?? {}, i18n.platform('common.continue'))}
				{/if}
			</button>
		</div>
	</div>
{:else if phase === 'welcome'}
	<div class="tutorial-overlay">
		<div class="tutorial-modal">
			<h2 class="text-xl font-semibold mb-3">{i18n.localized(config.welcome.title)}</h2>
			<p class="text-gray-600 mb-6">{i18n.localized(config.welcome.body)}</p>
			<div class="flex gap-3">
				<button
					class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer font-medium disabled:bg-indigo-400 disabled:cursor-wait flex items-center justify-center gap-2"
					onclick={beginTutorial}
					disabled={!hydrated || starting}
					aria-busy={!hydrated || starting}
				>
					{#if !hydrated || starting}
						<span class="spinner w-4 h-4 inline-block"></span>
						{i18n.platform('common.loading')}
					{:else}
						{i18n.localized(config.welcome.buttonText, i18n.platform('tutorial.begin'))}
					{/if}
				</button>
			{#if config.allowSkip !== false}
				<button
					class="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-wait"
					onclick={skip}
					disabled={!hydrated || starting}
				>
					{i18n.platform("tutorial.skip")}
				</button>
			{/if}
			</div>
		</div>
	</div>
{:else if phase === 'completion'}
	<div class="tutorial-overlay">
		<div class="tutorial-modal">
			<h2 class="text-xl font-semibold mb-3">{i18n.localized(config.completion.title)}</h2>
			<p class="text-gray-600 mb-6">{i18n.localized(config.completion.body)}</p>
			<button
				class="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer font-medium"
				onclick={finish}
			>
				{i18n.localized(config.completion.buttonText, i18n.platform('common.continue'))}
			</button>
		</div>
	</div>
{/if}

<style>
	/* Hide the Driver.js popover until our onHighlighted hook has finalised
	 * its position and tagged the element with data-tutorial-ready. The
	 * global selector is required because Driver.js injects the popover
	 * into document.body, outside this component's scoped CSS scope.
	 *
	 * The popover sequence is:
	 *   1. Driver.js inserts the popover into document.body.
	 *   2. Driver.js positions it (which on narrow viewports may centre it
	 *      over the scrubber).
	 *   3. onPopoverRender fires → we strip data-tutorial-ready (rule below
	 *      makes the popover invisible).
	 *   4. onHighlighted fires → maybeOverlayPopoverOnPlayerTop runs, then
	 *      we set data-tutorial-ready="true".
	 *
	 * Without this rule, the popover is briefly visible at the wrong
	 * position before step 4 finishes — the flicker the user reported.
	 */
	:global(.driver-popover:not([data-tutorial-ready='true'])) {
		opacity: 0 !important;
	}

	.tutorial-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tutorial-modal {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		max-width: 420px;
		width: 90%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	/* Driver.js theme — match the indigo accent */
	:global(.driver-popover) {
		border: 2px solid #6366f1 !important;
		border-radius: 10px !important;
	}

	:global(.driver-popover .driver-popover-next-btn),
	:global(.driver-popover .driver-popover-done-btn) {
		background-color: #4f46e5 !important;
		border-color: #4f46e5 !important;
		color: white !important;
		text-shadow: none !important;
	}

	:global(.driver-popover .driver-popover-next-btn[data-validation-blocked]),
	:global(.driver-popover .driver-popover-done-btn[data-validation-blocked]) {
		background-color: #9ca3af !important;
		border-color: #9ca3af !important;
		cursor: not-allowed !important;
		pointer-events: none !important;
	}

	:global(.driver-popover .driver-popover-prev-btn) {
		color: #374151 !important;
	}

	:global(.driver-popover .driver-popover-title) {
		font-weight: 600 !important;
	}

	:global(.driver-popover .driver-popover-progress-text) {
		color: #9ca3af !important;
	}
</style>
