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
	let {
		item,
		config,
		src: srcProp = undefined,
		mediaElement = $bindable(undefined)
	}: {
		item: StimulusItemType;
		config: StimuliConfigType;
		src?: string;
		mediaElement?: HTMLVideoElement | undefined;
	} = $props();

	let src = $derived(srcProp ?? getStimulusVideoUrl(item, config));
</script>

<div class="w-full rounded-lg overflow-hidden bg-black flex justify-center" id="stimulus-player">
	<!-- Cap height at 60vh so the gatekeeper / response widget below the
	     video stays in the viewport on laptop-class screens (1500x680 ish).
	     `w-auto h-auto` lets the video letterbox inside the cap rather than
	     stretching to fill width. -->
	<video
		bind:this={mediaElement}
		src={src}
		class="max-h-[60vh] w-auto h-auto"
		controls
		preload="auto"
	>
		<track kind="captions" />
	</video>
</div>
