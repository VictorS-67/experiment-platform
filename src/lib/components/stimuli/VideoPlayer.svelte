<script lang="ts" module>
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import type { StimulusItemType, StimuliConfigType } from '$lib/config/schema';

	export function getStimulusVideoUrl(item: StimulusItemType, config: StimuliConfigType): string {
		if (item.url) return item.url;
		if (item.filename && config.storagePath) {
			return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${config.storagePath}${item.filename}`;
		}
		return item.filename ?? '';
	}
</script>

<script lang="ts">
	import MediaScrubber, { type ScrubberMarker } from './MediaScrubber.svelte';

	let {
		item,
		config,
		src: srcProp = undefined,
		mediaElement = $bindable(undefined),
		markers = []
	}: {
		item: StimulusItemType;
		config: StimuliConfigType;
		src?: string;
		mediaElement?: HTMLVideoElement | undefined;
		markers?: ScrubberMarker[];
	} = $props();

	let src = $derived(srcProp ?? getStimulusVideoUrl(item, config));

	// Click-to-toggle play/pause on the video frame. Without `controls`, the
	// browser does not bind any default click action to the <video> element,
	// so participants who instinctively clicked the video (the YouTube /
	// Vimeo / native-controls affordance) got no feedback. This restores
	// that expectation and is what the tutorial's "Play the video to unlock
	// Next." step relies on.
	function toggleVideo() {
		if (!mediaElement) return;
		if (mediaElement.paused) {
			mediaElement.play().catch(() => { /* autoplay rejection — ignore, user gesture should satisfy */ });
		} else {
			mediaElement.pause();
		}
	}
</script>

<div class="w-full rounded-lg overflow-hidden bg-black" id="stimulus-player">
	<!-- Cap height at 60vh so the gatekeeper / response widget below the
	     video stays in the viewport on laptop-class screens (1500x680 ish).
	     `w-auto h-auto` lets the video letterbox inside the cap rather than
	     stretching to fill width. -->
	<div class="flex justify-center bg-black">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions —
		     the video frame deliberately behaves like every consumer video
		     player (YouTube / Vimeo / native `<video controls>`): a click
		     anywhere on the frame toggles play. Keyboard users get the same
		     control via the play button + Space-to-play in the scrubber below,
		     so the keyboard equivalent is not duplicated here. -->
		<video
			bind:this={mediaElement}
			src={src}
			class="max-h-[60vh] w-auto h-auto cursor-pointer"
			preload="auto"
			onclick={toggleVideo}
		>
			<track kind="captions" />
		</video>
	</div>
	<!-- Custom scrubber replaces native controls. Native controls deferred
	     seek-during-drag on Chrome; with this scrubber the frame follows the
	     thumb in real time across browsers, and we can render the saved
	     start/end markers along the timeline. -->
	<MediaScrubber media={mediaElement} {markers} />
</div>
