<script lang="ts">
	import type { StimulusItemType, StimuliConfigType } from '$lib/config/schema';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { i18n } from '$lib/i18n/index.svelte';
	import VideoPlayer from './VideoPlayer.svelte';
	import type { ScrubberMarker } from './MediaScrubber.svelte';

	let {
		item,
		config,
		src = undefined,
		mediaElement = $bindable(undefined),
		markers = []
	}: {
		item: StimulusItemType;
		config: StimuliConfigType;
		src?: string;
		mediaElement?: HTMLMediaElement | undefined;
		// Visual-only marker overlay on the video scrubber (e.g. saved
		// start/end timestamps). Ignored for non-video stimuli.
		markers?: ScrubberMarker[];
	} = $props();

	let stimulusType = $derived(item.type ?? config.type);

	function resolveTemplate(template: string, metadata: Record<string, unknown>): string {
		return template.replace(/\{metadata\.([^}]+)\}/g, (_, key) => String(metadata[key] ?? ''));
	}

	function resolveUrl(item: StimulusItemType): string {
		if (src) return src;
		if (item.url) return item.url;
		if (item.filename && config.storagePath) {
			return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${config.storagePath}${item.filename}`;
		}
		return item.filename ?? '';
	}
</script>

{#if stimulusType === 'video'}
	<VideoPlayer {item} {config} {src} {markers} bind:mediaElement={mediaElement as HTMLVideoElement | undefined} />
{:else if stimulusType === 'image'}
	<div class="w-full rounded-lg overflow-hidden" id="stimulus-player">
		<img src={resolveUrl(item)} alt={i18n.localized(item.label, item.id)} class="w-full" />
	</div>
{:else if stimulusType === 'audio'}
	<div class="w-full rounded-lg p-4 bg-gray-50 border" id="stimulus-player">
		<audio
			bind:this={mediaElement}
			src={resolveUrl(item)}
			controls
			class="w-full"
		>
		</audio>
	</div>
{:else if stimulusType === 'text'}
	<div class="w-full rounded-lg p-6 bg-gray-50 border" id="stimulus-player">
		<p class="text-lg">{i18n.localized(item.label, item.id)}</p>
	</div>
{:else}
	<p class="text-gray-400">Unknown stimulus type: {stimulusType}</p>
{/if}

{#if config.messageTemplate}
	<p class="mt-3 text-center text-gray-700 italic">
		{resolveTemplate(config.messageTemplate, item.metadata ?? {})}
	</p>
{/if}
