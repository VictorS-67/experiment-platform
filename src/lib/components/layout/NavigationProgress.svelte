<script lang="ts">
	import { navigating } from '$app/stores';

	// Top-of-viewport indeterminate progress bar shown during page-to-page
	// navigations that take longer than `delayMs`. Sub-100ms transitions
	// don't need feedback (and a flicker would be more distracting than the
	// momentary wait), so we delay before showing.
	//
	// SvelteKit's `goto()` awaits the destination's server load before
	// swapping the page, so without this indicator the participant just sees
	// the OLD page sitting still — looks like a freeze. The chunked phase
	// load can take a few seconds on free-tier Supabase; this bar makes that
	// wait feel deliberate.
	const delayMs = 150;
	let visible = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if ($navigating) {
			timer = setTimeout(() => { visible = true; }, delayMs);
		} else {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
			visible = false;
		}
	});
</script>

{#if visible}
	<div
		class="fixed top-0 left-0 right-0 z-[60] h-1 bg-blue-100 overflow-hidden"
		role="progressbar"
		aria-label="Loading next page"
	>
		<div class="nav-progress-bar h-full bg-blue-500"></div>
	</div>
{/if}

<style>
	/* Indeterminate animation: a sliding pill that travels left → right
	   and loops, signalling activity without pretending to know progress. */
	.nav-progress-bar {
		width: 35%;
		animation: slide 1.1s ease-in-out infinite;
		will-change: transform;
	}
	@keyframes slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(370%);
		}
	}
</style>
