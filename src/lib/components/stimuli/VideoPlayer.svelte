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
		mediaElement = $bindable(undefined)
	}: {
		item: StimulusItemType;
		config: StimuliConfigType;
		mediaElement?: HTMLVideoElement | undefined;
	} = $props();

	let src = $derived(getStimulusVideoUrl(item, config));
</script>

<div class="w-full rounded-lg overflow-hidden bg-black" id="stimulus-player">
	<video
		bind:this={mediaElement}
		src={src}
		class="w-full"
		controls
		preload="metadata"
	>
		<track kind="captions" />
	</video>
</div>
