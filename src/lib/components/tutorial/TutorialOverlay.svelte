<script lang="ts">
	import 'driver.js/dist/driver.css';
	import { onMount } from 'svelte';
	import type { TutorialConfigType } from '$lib/config/schema';
	import { i18n } from '$lib/i18n/index.svelte';

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

		if (validation.type === 'click') {
			const handler = () => {
				if (stepValidated) return;
				stepValidated = true;
				updateNextButtonState();
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
				if (el.value?.trim().length > 0) {
					stepValidated = true;
					updateNextButtonState();
				}
			};
			target.addEventListener('input', handler);
			validationCleanup = () => target.removeEventListener('input', handler);
		} else if (validation.type === 'play') {
			const media = target.querySelector('video, audio') ?? target;
			const handler = () => {
				if (stepValidated) return;
				stepValidated = true;
				updateNextButtonState();
			};
			media.addEventListener('play', handler);
			validationCleanup = () => media.removeEventListener('play', handler);
		}
	}

	function mapSide(position: string): 'top' | 'bottom' | 'left' | 'right' {
		if (['top', 'bottom', 'left', 'right'].includes(position)) {
			return position as 'top' | 'bottom' | 'left' | 'right';
		}
		return 'bottom';
	}

	async function beginTutorial() {
		phase = 'steps';

		// Wait for the welcome modal to unmount so the survey UI is visible
		await new Promise((r) => requestAnimationFrame(r));

		const { driver } = await import('driver.js');

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
					side: mapSide(step.position) as 'top' | 'bottom' | 'left' | 'right',
					align: 'center' as const
				}
			};
		});

		currentIndex = 0;
		stepValidated = false;

		driverInstance = driver({
			steps,
			showProgress: true,
			progressText: `${i18n.platform('tutorial.progress')} {{current}} ${i18n.platform('tutorial.of')} {{total}}`,
			nextBtnText: i18n.platform('tutorial.next'),
			prevBtnText: i18n.platform('tutorial.previous'),
			doneBtnText: i18n.platform('tutorial.finish'),
			allowClose: false,
			stagePadding: 10,
			stageRadius: 8,
			overlayOpacity: 0.5,
			onHighlighted: () => {
				// Fires after Driver.js has fully rendered the popover — safe to update the button
				setupValidation(config.steps[currentIndex]);
				updateNextButtonState();
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

	// Cleanup on unmount
	onMount(() => {
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
				class="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer font-medium"
				onclick={proceedFromIntro}
			>
				{i18n.localized(config.introduction.buttonText ?? {}, i18n.platform('tutorial.continue'))}
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
					class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 cursor-pointer font-medium"
					onclick={beginTutorial}
				>
					{i18n.localized(config.welcome.buttonText, i18n.platform('tutorial.begin'))}
				</button>
			{#if config.allowSkip !== false}
				<button
					class="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 cursor-pointer"
					onclick={skip}
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
				{i18n.localized(config.completion.buttonText, i18n.platform('survey.continue'))}
			</button>
		</div>
	</div>
{/if}

<style>
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
